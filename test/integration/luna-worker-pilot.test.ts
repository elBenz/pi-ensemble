import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { before, after, beforeEach, afterEach, it } from "node:test";
import { discoverAgents } from "../../src/agents/agents.ts";
import { createSubagentExecutor } from "../../src/runs/foreground/subagent-executor.ts";
import { buildLunaWorkerPilot } from "../../src/workflows/luna-worker-pilot.ts";
import { createMockPi, createTempDir, removeTempDir, createEventBus, makeMinimalCtx, events } from "../support/helpers.ts";

const mock = createMockPi();
let cwd: string;
before(() => mock.install());
after(() => mock.uninstall());
beforeEach(() => {
	mock.reset();
	cwd = createTempDir("luna-pilot-");
	fs.mkdirSync(path.join(cwd, ".pi"));
	fs.copyFileSync(new URL("../../.pi/settings.json", import.meta.url), path.join(cwd, ".pi/settings.json"));
	execFileSync("git", ["init", "-q"], { cwd });
	fs.writeFileSync(path.join(cwd, "implementation.txt"), "original");
	execFileSync("git", ["add", "."], { cwd });
	execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "fixture"], { cwd });
});
afterEach(() => removeTempDir(cwd));

async function run(background = false, extraVerify: Array<{ id: string; command: string; timeoutMs?: number }> = []) {
	const state = {
		baseCwd: cwd, currentSessionId: null, asyncJobs: new Map(), foregroundRuns: new Map(),
		foregroundControls: new Map(), lastForegroundControlId: null, cleanupTimers: new Map(),
		lastUiContext: null, poller: null, completionSeen: new Map(), watcher: null, watcherRestartTimer: null,
		resultFileCoalescer: { schedule: () => false, clear: () => {} },
	};
	const executor = createSubagentExecutor({
		pi: { events: createEventBus(), getSessionName: () => "pilot-test", setSessionName: () => {} },
		state, config: { intercomBridge: { mode: "off" } }, asyncByDefault: false,
		tempArtifactsDir: cwd, getSubagentSessionRoot: () => cwd,
		expandTilde: (value: string) => value,
		discoverAgents: () => discoverAgents(cwd, "project"),
	} as never);
	const params = buildLunaWorkerPilot({
		cwd, goal: "Implement bounded behavior", entryPoints: ["implementation.txt"],
		invariants: ["Preserve original evidence"], allowedFiles: ["implementation.txt", "luna-evidence.txt"],
		nonGoals: ["No unrelated changes"], clarificationConditions: ["Ask parent about scope changes"],
		verify: [{ id: "behavior", command: `node -e 'const f=require("fs"); f.appendFileSync("host-checks.txt", "checked\\n"); if(f.readFileSync("implementation.txt","utf8")!=="fixed") {console.error("expected fixed behavior"); process.exit(1)}'` }, ...extraVerify],
	});
	const result = await executor.execute("pilot", { ...params, async: background, mission: false }, new AbortController().signal, undefined, makeMinimalCtx(cwd) as never);
	if (background) {
		assert.ok(result.details.asyncDir);
		const statusPath = path.join(result.details.asyncDir!, "status.json");
		const deadline = Date.now() + 10000;
		while (Date.now() < deadline) {
			const status = JSON.parse(fs.readFileSync(statusPath, "utf8"));
			if (["complete", "failed", "stopped"].includes(status.state)) {
				assert.equal(status.state, "complete", JSON.stringify(status));
				return status.workflow.value;
			}
			await new Promise(resolve => setTimeout(resolve, 20));
		}
		assert.fail("Async pilot did not settle in 10s");
	}
	assert.ok(result.details.workflow?.value, JSON.stringify(result));
	return result.details.workflow!.value as any;
}

it("discovers project Sol-high delegate and Sol-medium worker without replacing personas or independent roles", () => {
	const agents = discoverAgents(cwd, "project").agents;
	const worker = agents.find(a => a.name === "worker")!;
	assert.equal(worker.model, "openai-codex/gpt-6.1-sol");
	assert.equal(worker.thinking, "medium");
	assert.equal(worker.defaultContext, "fresh");
	assert.match(worker.systemPrompt, /sole writer/);
	const delegate = agents.find(a => a.name === "delegate")!;
	assert.equal(delegate.model, "openai-codex/gpt-6.1-sol");
	assert.equal(delegate.thinking, "high");
	assert.deepEqual(delegate.fallbackModels, ["openai-codex/gpt-5.6-luna:medium"]);
	const baselineCwd = createTempDir("pilot-baseline-");
	try {
		const baseline = discoverAgents(baselineCwd, "project").agents;
		for (const role of ["reviewer", "oracle", "scout", "researcher"]) {
			assert.deepEqual(agents.find(a => a.name === role), baseline.find(a => a.name === role));
		}
		for (const role of ["worker", "delegate"]) {
			const actual = agents.find(a => a.name === role)!;
			const original = baseline.find(a => a.name === role)!;
			for (const field of ["systemPrompt", "systemPromptMode", "tools", "inheritProjectContext", "inheritSkills"] as const) {
				assert.deepEqual(actual[field], original[field], `${role}.${field} preserved`);
			}
		}
	} finally { removeTempDir(baselineCwd); }
});

it("host verifies Luna changes before returning review-ready", async () => {
	mock.onCall({ jsonl: [...events.completedWrite("implementation.txt", "fixed"), events.assistantMessage("implemented")], writeFiles: [{ path: "implementation.txt", content: "fixed" }] });
	const value = await run();
	assert.equal(value.status, "review-ready");
	assert.equal(value.repairs, 0);
	assert.equal(mock.callCount(), 1);
	assert.equal(fs.readFileSync(path.join(cwd, "host-checks.txt"), "utf8"), "checked\n");
	assert.equal(value.attempts[0].results[0].acceptance.evidenceStatus, "verified");
});

function implement(content: string, extra = false) {
	mock.onCall({
		jsonl: [...events.completedWrite("implementation.txt", content), events.assistantMessage("Implemented; child claims checks pass. Host counters unavailable to child.")],
		writeFiles: [{ path: "implementation.txt", content }, ...(extra ? [{ path: "luna-evidence.txt", content: "preserve me" }] : [])],
	});
}

function reportWithCriterion(status?: string, evidence = "unmet quality target"): string {
	return "```acceptance-report\n" + JSON.stringify({
		criteriaSatisfied: status === undefined ? [] : [{ id: "criterion-1", status, evidence }],
		changedFiles: ["implementation.txt"], testsAddedOrUpdated: ["test/integration/luna-worker-pilot.test.ts"],
		commandsRun: [{ command: "host check", result: "failed", summary: "failed" }],
		validationOutput: ["host check failed"], residualRisks: [], noStagedFiles: true,
	}) + "\n```";
}

function implementWithReport(content: string, report: string) {
	mock.onCall({
		jsonl: [...events.completedWrite("implementation.txt", content), events.assistantMessage(report)],
		writeFiles: [{ path: "implementation.txt", content }],
	});
}

function calls(): Array<{ args: string[]; cwd: string }> {
	return fs.readdirSync(mock.dir).filter(name => name.startsWith("call-") && name.endsWith(".json"))
		.sort().map(name => JSON.parse(fs.readFileSync(path.join(mock.dir, name), "utf8")));
}

it("repairs failed host acceptance once with fresh Sol, same cwd and Luna evidence", async () => {
	implement("broken", true);
	implement("fixed");
	const value = await run();
	assert.equal(value.status, "review-ready", JSON.stringify(value));
	assert.equal(value.repairs, 1);
	assert.equal(mock.callCount(), 2);
	assert.equal(fs.readFileSync(path.join(cwd, "luna-evidence.txt"), "utf8"), "preserve me");
	assert.equal(fs.readFileSync(path.join(cwd, "host-checks.txt"), "utf8"), "checked\nchecked\n");
	assert.equal(value.attempts[0].results[0].acceptance.verifyRuns[0].status, "failed");
	assert.match(value.attempts[0].results[0].acceptance.verifyRuns[0].stderr, /expected fixed/);
	const [luna, sol] = value.attempts.map((a: any) => a.results[0]);
	assert.equal(luna.model, "openai-codex/gpt-6-luna:medium");
	assert.equal(sol.model, "openai-codex/gpt-6.1-sol:medium");
	assert.equal(luna.thinking, "medium");
	assert.equal(sol.thinking, "medium");
	assert.equal(luna.context, "fresh");
	assert.equal(sol.context, "fresh");
	assert.notEqual(luna.sessionFile, sol.sessionFile);
	const input = calls()[1]!.args.join("\n");
	assert.match(input, /expected fixed behavior/);
	assert.match(input, /One bounded quality repair/);
	assert.match(input, /luna|Luna/);
	assert.equal(value.telemetry.completeness, "not-established");
	for (const call of calls()) {
		assert.equal(fs.realpathSync(call.cwd), fs.realpathSync(cwd));
		assert.ok(!call.args.includes("--resume"));
	}
});

it("does not repair mixed failed and timed-out host verification", async () => {
	implement("broken");
	const value = await run(false, [{ id: "hang", command: "node -e 'setInterval(() => {}, 1000)'", timeoutMs: 100 }]);
	assert.equal(value.status, "parent-decision");
	assert.equal(value.repairs, 0);
	assert.equal(mock.callCount(), 1);
	assert.deepEqual(value.attempts[0].results[0].acceptance.verifyRuns.map((check: any) => check.status), ["failed", "timed-out"]);
});

it("repairs explicit not-satisfied quality criterion with failed host command", async () => {
	implementWithReport("broken", reportWithCriterion("not-satisfied"));
	implement("fixed");
	const value = await run();
	assert.equal(value.status, "review-ready", JSON.stringify(value));
	assert.equal(value.repairs, 1);
	assert.equal(mock.callCount(), 2);
	const ledger = value.attempts[0].results[0].acceptance;
	assert.equal(ledger.childReport.criteriaSatisfied[0].status, "not-satisfied");
	assert.equal(ledger.runtimeChecks.find((check: any) => check.id === "criterion:criterion-1").status, "failed");
	assert.equal(ledger.verifyRuns[0].status, "failed");
});

it("missing or malformed criterion evidence never triggers repair despite failed host command", async () => {
	for (const [name, report] of [
		["missing", reportWithCriterion()],
		["malformed", reportWithCriterion("invalid-status")],
	] as const) {
		implementWithReport("broken", report);
		const value = await run();
		assert.equal(value.status, "parent-decision", name);
		assert.equal(value.repairs, 0, name);
		assert.deepEqual(value.attempts[0].results[0].acceptance.verifyRuns.map((check: any) => check.status),
			name === "missing" ? ["failed"] : [], name);
		assert.equal(mock.callCount(), 1, name);
		mock.reset();
	}
});

it("second quality failure returns parent decision without a third writer", async () => {
	implement("broken", true);
	implement("still broken");
	const value = await run();
	assert.equal(value.status, "parent-decision");
	assert.equal(value.repairs, 1);
	assert.equal(mock.callCount(), 2);
	assert.equal(value.attempts[1].results[0].acceptance.verifyRuns[0].status, "failed");
	assert.equal(fs.readFileSync(path.join(cwd, "implementation.txt"), "utf8"), "still broken");
});

it("provider failure is not a quality repair", async () => {
	mock.onCall({ exitCode: 1, stderr: "model unavailable", output: "Provider unavailable" });
	const value = await run();
	assert.equal(value.status, "parent-decision");
	assert.equal(value.repairs, 0);
	assert.equal(mock.callCount(), 1);
});

it("actual host/accounting execution failure does not masquerade as missing child telemetry", async () => {
	mock.onCall({ exitCode: 1, stderr: "Accounting reconciliation failed", output: "Accounting reconciliation failed" });
	const value = await run();
	assert.equal(value.status, "parent-decision");
	assert.equal(value.repairs, 0);
	assert.match(value.attempts[0].error, /Accounting reconciliation failed/);
	assert.equal(mock.callCount(), 1);
});

it("accepts verified work without provider usage, marking accounting completeness unknown", async () => {
	const entries = [...events.completedWrite("implementation.txt", "fixed"), events.assistantMessage("Host counters unavailable")];
	for (const entry of entries) if ((entry as any).message) delete (entry as any).message.usage;
	mock.onCall({ jsonl: entries, writeFiles: [{ path: "implementation.txt", content: "fixed" }] });
	const value = await run();
	assert.equal(value.status, "review-ready");
	assert.equal(value.telemetry.completeness, "not-established");
	assert.equal(mock.callCount(), 1);
});

function configureFallback() {
	const settingsPath = path.join(cwd, ".pi/settings.json");
	const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
	settings.subagents.agentOverrides.worker.fallbackModels = ["openai-codex/gpt-6-sol:medium"];
	fs.writeFileSync(settingsPath, JSON.stringify(settings));
}

it("existing provider fallback stays separate from quality repair", async () => {
	configureFallback();
	mock.onCall({ exitCode: 1, stderr: "provider unavailable", output: "provider unavailable" });
	implement("fixed");
	const value = await run();
	assert.equal(value.status, "review-ready");
	assert.equal(value.repairs, 0);
	assert.equal(mock.callCount(), 2);
	assert.deepEqual(value.attempts[0].results[0].modelAttempts.map((a: any) => a.success), [false, true]);
	assert.equal(value.attempts[0].results[0].modelAttempts[1].model, "openai-codex/gpt-6-sol:medium");
});

it("provider failure after mutation preserves replay barrier and never launches repair", async () => {
	configureFallback();
	mock.onCall({
		exitCode: 1, stderr: "provider unavailable",
		jsonl: [events.toolStart("write", { path: "implementation.txt" }), ...events.completedWrite("implementation.txt", "partial"), events.assistantMessage("provider unavailable")],
		writeFiles: [{ path: "implementation.txt", content: "partial" }],
	});
	const value = await run();
	assert.equal(value.status, "parent-decision");
	assert.equal(value.repairs, 0);
	assert.equal(mock.callCount(), 1);
	assert.match(value.attempts[0].error, /Automatic retry\/fallback blocked/);
	assert.equal(fs.readFileSync(path.join(cwd, "implementation.txt"), "utf8"), "partial");
});

it("async workflow publishes repaired acceptance and both child ledgers", async () => {
	implement("broken", true);
	implement("fixed");
	const value = await run(true);
	assert.equal(value.status, "review-ready");
	assert.equal(value.repairs, 1);
	assert.equal(value.attempts[0].results[0].acceptance.evidenceStatus, "rejected");
	assert.equal(value.attempts[1].results[0].acceptance.evidenceStatus, "verified");
	assert.equal(mock.callCount(), 2);
});

it("revalidates untracked-only repairs rather than reusing tracked-tree verification", async () => {
	execFileSync("git", ["rm", "--cached", "implementation.txt"], { cwd });
	execFileSync("git", ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-qm", "untrack fixture"], { cwd });
	implement("broken", true);
	implement("fixed");
	const value = await run();
	assert.equal(value.status, "review-ready");
	assert.equal(fs.readFileSync(path.join(cwd, "host-checks.txt"), "utf8"), "checked\nchecked\n");
	assert.ok(value.attempts.every((a: any) => a.results[0].acceptance.verifyRuns[0].memoized === false));
});
