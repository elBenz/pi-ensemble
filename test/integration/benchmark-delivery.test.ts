import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseBenchmarkCase, runBenchmarkCase } from "../../src/benchmark/runner.ts";
import { runBenchmarkPlan } from "../../src/benchmark/suite.ts";
import { createMockPi } from "../support/mock-pi.ts";

const corpus = path.resolve(import.meta.dirname, "../../benchmarks/delivery");
const roots: string[] = [];
const mocks: ReturnType<typeof createMockPi>[] = [];
afterEach(() => {
	for (const mock of mocks.splice(0)) mock.uninstall();
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function prepare(id: string) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-delivery-"));
	roots.push(root);
	const caseDir = path.join(corpus, id);
	const definition = JSON.parse(fs.readFileSync(path.join(caseDir, "case.json"), "utf8"));
	definition.fixture = path.resolve(caseDir, definition.fixture);
	definition.evaluator.args = definition.evaluator.args.map((arg: string) => arg.replaceAll("{caseDir}", caseDir));
	definition.route = { modelTier: "Offline fixture", model: "fixture/offline", thinkingLevel: "low" };
	definition.currentPricing = { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-09-07", source: "https://example.invalid/synthetic-test-rates", input: 0, output: 1, cacheRead: 0, cacheWrite: 0 };
	const casePath = path.join(root, "case.json");
	fs.writeFileSync(casePath, JSON.stringify(definition));
	const mock = createMockPi();
	mocks.push(mock);
	mock.install();
	return { root, casePath, mock, definition };
}
function response(answer: unknown, writeFiles: Array<{ path: string; content: string }> = [], output = 20) {
	return {
		writeFiles,
		sessionEntries: [{ type: "model_change", provider: "fixture", modelId: "offline" }, { type: "thinking_level_change", thinkingLevel: "low" }],
		jsonl: [{ type: "message_end", message: {
			role: "assistant", model: "fixture/offline", api: "openai-responses", stopReason: "stop",
			content: [{ type: "text", text: JSON.stringify(answer) }],
			usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage: {
				input_tokens: 100, output_tokens: output, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 }, total_tokens: 120,
			} },
		} }],
	};
}
async function run(id: string, answer: unknown, writes: Array<{ path: string; content: string }> = []) {
	const setup = prepare(id);
	setup.mock.onCall(response(answer, writes));
	const result = await runBenchmarkCase({ casePath: setup.casePath, outputDir: path.join(setup.root, "run") });
	const normalized = JSON.parse(fs.readFileSync(result.resultPath, "utf8"));
	const receipt = JSON.parse(fs.readFileSync(result.receiptPath, "utf8"));
	assert.ok(Object.keys(receipt.workspace.before).every((name) => !/evaluator|expectations|case\.json|\.git|SOURCES/.test(name)));
	assert.doesNotMatch(receipt.invocation.args.join("\n"), /expectations\.json|evaluator\.mjs|checks\.mjs/);
	return { ...setup, result, normalized, receipt, evidence: JSON.parse(normalized.evaluation.evidence) };
}
const deadlineFix = `export function launchOptions(params, agent, parentDeadlineAt, now) {
  const result = { ...params };
  if (result.timeoutMs === undefined && result.maxRuntimeMs === undefined) {
    if (agent.defaultTimeoutMs !== undefined) result.timeoutMs = agent.defaultTimeoutMs;
    else if (parentDeadlineAt !== undefined) result.timeoutMs = Math.max(1, parentDeadlineAt - now);
  }
  return result;
}
`;

function finding(behavior: string, severity: string, oldText: string, newText: string) {
	const source = fs.readFileSync(path.join(corpus, "fixtures", behavior, `${behavior}.mjs`), "utf8");
	const startLine = source.slice(0, source.indexOf(oldText)).split("\n").length;
	return { path: `${behavior}.mjs`, startLine, endLine: startLine + oldText.split("\n").length - 1,
		quote: oldText, severity, explanation: "This branch violates the documented contract; replacement preserves the required boundary.", repair: { oldText, newText } };
}
const indexOld = '  return io.scanAll().filter((run) => run.sessionId === sessionId).slice(0, limit);';
const indexNew = '  return io.recent(sessionId, limit).filter((run) => run.sessionId === sessionId).slice(0, limit);';
const guardOld = '  const wantsChanges = request.applyChanges || request.suggestedFix;';
const guardNew = '  const wantsChanges = request.applyChanges;';
const queueOld = '      tails.delete(key);';
const queueNew = `      tails.set(key, current);
      const clear = () => { if (tails.get(key) === current) tails.delete(key); };
      void current.then(clear, clear);`;
const recordsOld = '  return records.filter(record => record.state === "completed").map(record => record.artifact);';
const recordsNew = `  if (!Array.isArray(records)) throw new TypeError("records");
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || typeof record.id !== "string" || !record.id.trim()
      || !["running", "completed"].includes(record.state)
      || (record.state === "completed" && (typeof record.artifact !== "string" || !record.artifact.trim()))) throw new TypeError("record");
  }
  return records.filter(record => record.state === "completed").map(record => record.artifact);`;
const boundaryOld = '  if (!result.ok && result.retryable) return fallback();';
const boundaryNew = '  if (!result.ok && result.retryable && !result.mutationAttempted) return fallback();';

describe("delivery and review Agent role corpus", () => {
	it("indexes three cases per role with explicit provenance, fixed fixture bytes and no pretend live pricing", () => {
		const manifest = JSON.parse(fs.readFileSync(path.join(corpus, "corpus.json"), "utf8"));
		const cases: Array<{ role: string; stage: string; case: string; origin: string }> = manifest.cases;
		assert.equal(cases.length, 9);
		assert.equal(new Set(cases.map(entry => entry.case)).size, 9);
		for (const role of ["worker", "reviewer", "watchdog"]) {
			assert.equal(cases.filter(entry => entry.role === role && entry.stage === "screening" && entry.origin === "history-derived-reproduction").length, 1);
			assert.equal(cases.filter(entry => entry.role === role && entry.stage === "finalist" && entry.origin === "synthetic").length, 2);
		}
		for (const entry of cases) {
			const definition = parseBenchmarkCase(JSON.parse(fs.readFileSync(path.join(corpus, entry.case), "utf8")));
			assert.equal(definition.agentRole, entry.role);
			assert.equal(definition.evaluator.kind, "command");
			assert.equal(definition.route.model, "unconfigured/delivery-corpus");
			assert.equal(definition.currentPricing, undefined);
			assert.equal(definition.mutationPolicy, entry.role === "worker" ? "require" : "forbid");
		}
		const provenance = JSON.parse(fs.readFileSync(path.join(corpus, "SOURCES.json"), "utf8"));
		assert.equal(provenance.historicalSeeds.length, 3);
		for (const file of provenance.fixtureFiles) {
			assert.equal(createHash("sha256").update(fs.readFileSync(path.join(corpus, file.path))).digest("hex"), file.sha256, file.path);
		}
	});
	it("requires working deadline delivery and focused tests, not claimed success or no-op", async () => {
		const answer = { changedFiles: ["deadline.mjs"], summary: "Inherited parent deadline without overriding explicit limits." };
		const good = await run("worker-deadline", answer, [{ path: "deadline.mjs", content: deadlineFix }]);
		assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
		assert.equal(good.evidence.checks.focusedTests, true);
		const noop = await run("worker-deadline", answer);
		assert.equal(noop.result.passed, false);
		assert.equal(noop.normalized.mutation.passed, false);
		const regression = await run("worker-deadline", answer, [{ path: "deadline.mjs", content: deadlineFix.replace('result.timeoutMs === undefined && result.maxRuntimeMs === undefined', '!result.timeoutMs && !result.maxRuntimeMs') }]);
		assert.equal(regression.result.passed, false, "Explicit zero must survive inheritance");
		assert.equal(regression.evidence.checks.focusedTests, true, "Hidden regression goes beyond focused tests");
		const widened = await run("worker-deadline", answer, [{ path: "deadline.mjs", content: deadlineFix }, { path: "focused.test.mjs", content: "// disabled" }]);
		assert.equal(widened.result.passed, false);
		assert.equal(widened.evidence.checks.isolation, false);
	});
	it("scores seeded async-index recall, severity, source evidence and executable advice; penalizes noise", async () => {
		const defect = finding("index", "high", indexOld, indexNew);
		const good = await run("reviewer-index", { findings: [defect] });
		assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
		const missed = await run("reviewer-index", { findings: [] });
		assert.equal(missed.result.passed, false);
		assert.equal(missed.evidence.checks.recall, false);
		const noisy = await run("reviewer-index", { findings: [defect, { ...defect, path: "focused.test.mjs" }] });
		assert.equal(noisy.result.passed, false);
		assert.equal(noisy.evidence.checks.noFalsePositives, false);
		assert.ok(noisy.evidence.score < good.evidence.score);
		for (const changed of [{ severity: "low" }, { startLine: 99 }, { repair: { oldText: indexOld, newText: "  return [];" } }]) {
			assert.equal((await run("reviewer-index", { findings: [{ ...defect, ...changed }] })).result.passed, false);
		}
	});
	it("detects completion-guard regression and refuses unnecessary blocking of clean read-only delivery", async () => {
		const defect = finding("guard", "high", guardOld, guardNew);
		const detected = await run("watchdog-guard", { findings: [defect], decision: "block" });
		assert.equal(detected.result.passed, true, detected.normalized.evaluation.evidence);
		assert.equal((await run("watchdog-guard", { findings: [], decision: "allow" })).result.passed, false);
		assert.equal((await run("watchdog-clean", { findings: [], decision: "allow" })).result.passed, true);
		const blocked = await run("watchdog-clean", { findings: [], decision: "block" });
		assert.equal(blocked.result.passed, false);
		assert.equal(blocked.evidence.checks.completionJudgment, false);
		const noisy = await run("watchdog-clean", { findings: [defect], decision: "block" });
		assert.equal(noisy.evidence.checks.noFalsePositives, false);
	});
	it("detects critical concurrency defects and checks unseen rejection/ownership schedules in review advice", async () => {
		const defect = finding("queue", "critical", queueOld, queueNew);
		for (const role of ["reviewer", "watchdog"]) {
			const answer = { findings: [defect], ...(role === "watchdog" ? { decision: "block" } : {}) };
			const good = await run(`${role}-queue`, answer);
			assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
			assert.equal((await run(`${role}-queue`, { ...answer, findings: [] })).result.passed, false);
			const staleCleanup = { ...defect, repair: { oldText: queueOld, newText: queueNew.replace('if (tails.get(key) === current) ', '') } };
			const regressed = await run(`${role}-queue`, { ...answer, findings: [staleCleanup] });
			assert.equal(regressed.result.passed, false, "Old owner must not clear a newer queued owner");
			assert.equal(regressed.evidence.checks.actionableRepair, false);
		}
	});
	it("accepts alternate source-backed defect citations without accepting empty or fabricated evidence", async () => {
		const defect = finding("queue", "critical", queueOld, queueNew);
		const alternate = { ...defect, startLine: 6, endLine: 6,
			quote: "const current = previous.catch(() => {}).then(task);",
			explanation: "The new tail is never registered, so another same-key task cannot wait for it. Register current and clear only its own ownership." };
		for (const role of ["reviewer", "watchdog"]) {
			const answer = { findings: [alternate], ...(role === "watchdog" ? { decision: "block" } : {}) };
			const good = await run(`${role}-queue`, answer);
			assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
			for (const quote of ["", "   ", "const current = task();"]) {
				assert.equal((await run(`${role}-queue`, { ...answer, findings: [{ ...alternate, quote }] })).result.passed, false);
			}
		}
	});
	it("rejects unseen malformed completion records in worker delivery and reviewer repair advice", async () => {
		const source = fs.readFileSync(path.join(corpus, "fixtures/records/records.mjs"), "utf8");
		const answer = { changedFiles: ["records.mjs"], summary: "Validate every completion record before extracting artifacts." };
		const fixed = source.replace(recordsOld, recordsNew);
		const good = await run("worker-records", answer, [{ path: "records.mjs", content: fixed }]);
		assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
		const defect = finding("records", "medium", recordsOld, recordsNew);
		assert.equal((await run("reviewer-records", { findings: [defect] })).result.passed, true);
		const weak = recordsNew.replace('typeof record.id !== "string" || !record.id.trim()', 'typeof record.id !== "string"');
		assert.equal((await run("worker-records", answer, [{ path: "records.mjs", content: source.replace(recordsOld, weak) }])).result.passed, false);
		assert.equal((await run("reviewer-records", { findings: [{ ...defect, repair: { oldText: recordsOld, newText: weak } }] })).result.passed, false);
	});
	it("requires safe execution-boundary delivery and preserves seeded non-retry behavior", async () => {
		const source = fs.readFileSync(path.join(corpus, "fixtures/boundary/boundary.mjs"), "utf8");
		const answer = { changedFiles: ["boundary.mjs"], summary: "Do not replay after a mutation attempt." };
		const fixed = source.replace(boundaryOld, boundaryNew);
		const good = await run("worker-boundary", answer, [{ path: "boundary.mjs", content: fixed }]);
		assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
		assert.equal((await run("worker-boundary", answer)).result.passed, false);
		assert.equal((await run("worker-boundary", answer, [{ path: "boundary.mjs", content: fixed.replace('!result.ok && result.retryable && ', '') }])).result.passed, false);
	});
	it("runs watchdog through CLI with a packaged benchmark-only prompt and still rejects unknown roles", async () => {
		const setup = prepare("watchdog-clean");
		setup.mock.onCall(response({ findings: [], decision: "allow" }));
		const outputDir = path.join(setup.root, "cli-run");
		const child = spawnSync(process.execPath, [path.resolve(corpus, "../../benchmark-runner.mjs"), setup.casePath, "--output", outputDir], { encoding: "utf8", timeout: 30000 });
		assert.equal(child.status, 0, child.stderr || child.stdout);
		const frozen = fs.readFileSync(path.resolve(corpus, "../../docs/benchmark-prompts/watchdog.md"), "utf8");
		assert.equal(fs.readFileSync(path.join(outputDir, "agent-role.md"), "utf8"), frozen);
		assert.equal(fs.existsSync(path.resolve(corpus, "../../agents/watchdog.md")), false, "No production watchdog agent installed");
		const receipt = JSON.parse(fs.readFileSync(path.join(outputDir, "receipt.json"), "utf8"));
		assert.equal(receipt.case.agentRole, "watchdog");
		assert.ok(receipt.invocation.args.includes(path.join(outputDir, "agent-role.md")));
		setup.definition.agentRole = "not-a-known-agent";
		fs.writeFileSync(setup.casePath, JSON.stringify(setup.definition));
		await assert.rejects(() => runBenchmarkCase({ casePath: setup.casePath, outputDir: path.join(setup.root, "unknown-run") }), /Unknown Agent role/);
		assert.equal(setup.mock.callCount(), 1);
	});
	it("finishes isolated mutation delivery beyond spend exhaustion, then blocks the next launch", async () => {
		const setup = prepare("worker-deadline");
		const original = fs.readFileSync(path.join(setup.definition.fixture, "deadline.mjs"), "utf8");
		setup.mock.onCall(response({ changedFiles: ["deadline.mjs"], summary: "Delivered safely." }, [{ path: "deadline.mjs", content: deadlineFix }], 25_500_000));
		const planPath = path.join(setup.root, "plan.json");
		fs.writeFileSync(planPath, JSON.stringify({ id: "delivery-budget", stage: "screening", launches: [{ case: "case.json", repetitions: 2 }] }));
		const outputDir = path.join(setup.root, "plan-run");
		const result = await runBenchmarkPlan({ planPath, outputDir });
		assert.equal(result.blocked, true);
		assert.equal(setup.mock.callCount(), 1);
		const delivered = JSON.parse(fs.readFileSync(path.join(outputDir, "run-001/result.json"), "utf8"));
		assert.equal(delivered.passed, true, delivered.evaluation.evidence);
		assert.equal(delivered.execution.timedOut, false);
		assert.equal(fs.readFileSync(path.join(outputDir, "run-001/workspace/deadline.mjs"), "utf8"), deadlineFix);
		assert.equal(fs.readFileSync(path.join(setup.definition.fixture, "deadline.mjs"), "utf8"), original);
		assert.equal(fs.existsSync(path.join(outputDir, "run-001/receipt.json")), true);
		const receipt = JSON.parse(fs.readFileSync(result.receiptPath, "utf8"));
		assert.deepEqual(receipt.decisions.map((entry: { action: string }) => entry.action), ["launched", "blocked"]);
		assert.equal(receipt.decisions[0].cumulativeSpendAfter, 25.5);
	});
	it("rejects malformed review contracts and read-only mutation even with correct advice", async () => {
		assert.equal((await run("watchdog-clean", { findings: [], decision: "allow", extra: "unsupported claim" })).result.passed, false);
		const defect = finding("index", "high", indexOld, indexNew);
		const mutated = await run("reviewer-index", { findings: [defect] }, [{ path: "notes.txt", content: "unauthorized" }]);
		assert.equal(mutated.result.passed, false);
		assert.equal(mutated.normalized.mutation.passed, false);
	});
	it("bounds a hanging suggested repair with evaluator timeout without changing candidate source", async () => {
		const setup = prepare("reviewer-index");
		const defect = finding("index", "high", indexOld, '  for (;;) {}');
		setup.definition.evaluator.timeoutMs = 500;
		fs.writeFileSync(setup.casePath, JSON.stringify(setup.definition));
		setup.mock.onCall(response({ findings: [defect] }));
		const outputDir = path.join(setup.root, "run");
		const result = await runBenchmarkCase({ casePath: setup.casePath, outputDir });
		assert.equal(result.passed, false);
		const normalized = JSON.parse(fs.readFileSync(result.resultPath, "utf8"));
		assert.equal(normalized.evaluation.timedOut, true);
		assert.deepEqual(normalized.mutation.changedFiles, []);
	});
});
