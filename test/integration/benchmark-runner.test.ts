import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { runBenchmarkCase } from "../../src/benchmark/runner.ts";
import { createMockPi } from "../support/mock-pi.ts";

const tempDirs: string[] = [];
const mocks: ReturnType<typeof createMockPi>[] = [];

afterEach(() => {
	for (const mock of mocks.splice(0)) mock.uninstall();
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function run(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd, env: process.env, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.once("error", reject);
		child.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}

async function runBenchmarkCommand(repo: string, casePath: string, outputDir: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
	if (process.platform !== "win32") return run(process.execPath, [path.join(repo, "benchmark-runner.mjs"), casePath, "--output", outputDir], repo);
	try {
		const result = await runBenchmarkCase({ casePath, outputDir });
		return { code: result.passed ? 0 : 1, stdout: `${result.passed ? "PASS" : "FAIL"} ${result.outputDir}\n`, stderr: "" };
	} catch (error) {
		return { code: 2, stdout: "", stderr: error instanceof Error ? error.message : String(error) };
	}
}

describe("benchmark runner", () => {
	it("runs one hidden-evaluation Agent role case through a fresh fake Pi session", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-runner-"));
		tempDirs.push(root);
		const fixture = path.join(root, "fixture");
		const outputDir = path.join(root, "run");
		fs.mkdirSync(fixture);
		fs.writeFileSync(path.join(fixture, "input.txt"), "candidate-visible\n");
		const casePath = path.join(root, "case.json");
		fs.writeFileSync(casePath, JSON.stringify({
			id: "scout-synthetic",
			agentRole: "scout",
			route: {
				modelTier: "GPT-5.6 Luna",
				model: "openai-codex/gpt-5.6-luna",
				thinkingLevel: "medium",
			},
			prompt: "Find the relevant file and report its contents.",
			fixture: "fixture",
			evaluator: { kind: "output-includes", expected: "needle-known-only-to-evaluator" },
			timeoutMs: 2_000,
			mutationPolicy: "forbid",
		}));

		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		mock.onCall({
			sessionEntries: [
				{ type: "model_change", provider: "openai-codex", modelId: "gpt-5.6-luna" },
				{ type: "thinking_level_change", thinkingLevel: "medium" },
			],
			jsonl: [{
				type: "message_end",
				message: {
					role: "assistant",
					content: [{ type: "text", text: "Found needle-known-only-to-evaluator" }],
					model: "openai-codex/gpt-5.6-luna",
					stopReason: "stop",
					usage: { input: 120, output: 30, cacheRead: 10, cacheWrite: 0, totalTokens: 155, cost: { total: 0.004 } },
				},
			}],
		});

		const repo = path.resolve(import.meta.dirname, "../..");
		const completed = await runBenchmarkCommand(repo, casePath, outputDir);
		assert.equal(completed.code, 0, completed.stderr);
		assert.match(completed.stdout, /PASS/);
		assert.equal(mock.callCount(), 1);

		const callName = fs.readdirSync(mock.dir).find((name) => name.startsWith("call-"));
		assert.ok(callName);
		const call = JSON.parse(fs.readFileSync(path.join(mock.dir, callName), "utf-8"));
		assert.equal(fs.realpathSync(call.cwd), fs.realpathSync(path.join(outputDir, "workspace")));
		assert.ok(call.args.includes("--session"));
		assert.equal(call.args[call.args.indexOf("--model") + 1], "openai-codex/gpt-5.6-luna");
		assert.equal(call.args[call.args.indexOf("--thinking") + 1], "medium");
		assert.match(call.systemPrompts[0].text, /scout/i);
		assert.doesNotMatch(call.args.join("\n"), /needle-known-only-to-evaluator/);
		assert.doesNotMatch(JSON.stringify(call.systemPrompts), /needle-known-only-to-evaluator/);
		assert.equal(fs.readFileSync(path.join(outputDir, "workspace", "input.txt"), "utf-8"), "candidate-visible\n");
		assert.doesNotMatch(JSON.stringify(fs.readdirSync(path.join(outputDir, "workspace"))), /evaluator|expect/i);

		const receiptPath = path.join(outputDir, "receipt.json");
		const resultPath = path.join(outputDir, "result.json");
		const reportPath = path.join(outputDir, "report.md");
		const receipt = JSON.parse(fs.readFileSync(receiptPath, "utf-8"));
		const result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
		assert.equal(receipt.case.agentRole, "scout");
		assert.equal(receipt.resolved.model, "openai-codex/gpt-5.6-luna");
		assert.equal(receipt.resolved.thinkingLevel, "medium");
		assert.equal(receipt.session.fresh, true);
		assert.equal("evaluation" in receipt, false);
		assert.equal(result.passed, true);
		assert.equal(result.metrics.cumulativeOutputTokens, 30);
		assert.equal(result.metrics.peakContextLoad, 155);
		assert.equal(result.evaluation.passed, true);
		assert.match(fs.readFileSync(reportPath, "utf-8"), /# Benchmark: scout-synthetic[\s\S]*PASS[\s\S]*GPT-5\.6 Luna/);
		if (process.platform !== "win32") assert.equal(fs.statSync(receiptPath).mode & 0o222, 0);
	});

	it("runs a hidden command evaluator and detects empty-directory mutation", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-command-evaluator-"));
		tempDirs.push(root);
		const outputDir = path.join(root, "run");
		const casePath = path.join(root, "case.json");
		const evaluatorScript = "const fs=require('fs');const x=JSON.parse(fs.readFileSync(process.env.PI_BENCHMARK_EVALUATOR_INPUT,'utf8'));if(x.expectations.secret!=='host-only' || !fs.statSync(x.workspace+'/created-empty').isDirectory())process.exit(1);process.stdout.write('hidden checks passed')";
		fs.writeFileSync(casePath, JSON.stringify({
			id: "worker-command-evaluator",
			agentRole: "worker",
			route: { modelTier: "GPT-5.6 Terra", model: "openai-codex/gpt-5.6-terra", thinkingLevel: "high" },
			prompt: "Create the requested directory.",
			evaluator: { kind: "command", command: process.execPath, args: ["-e", evaluatorScript], expectations: { secret: "host-only" } },
			timeoutMs: 2_000,
			mutationPolicy: "require",
		}));
		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		mock.onCall({
			makeDirs: ["created-empty"],
			sessionEntries: [
				{ type: "model_change", provider: "openai-codex", modelId: "gpt-5.6-terra" },
				{ type: "thinking_level_change", thinkingLevel: "high" },
			],
			output: "Directory created.",
		});
		const repo = path.resolve(import.meta.dirname, "../..");
		const completed = await runBenchmarkCommand(repo, casePath, outputDir);
		assert.equal(completed.code, 0, completed.stderr);
		const result = JSON.parse(fs.readFileSync(path.join(outputDir, "result.json"), "utf-8"));
		assert.deepEqual(result.mutation.changedFiles, ["created-empty"]);
		assert.equal(result.mutation.passed, true);
		assert.equal(result.evaluation.passed, true);
		assert.match(result.evaluation.evidence, /hidden checks passed/);
		const callName = fs.readdirSync(mock.dir).find((name) => name.startsWith("call-"));
		assert.ok(callName);
		const call = fs.readFileSync(path.join(mock.dir, callName), "utf-8");
		assert.doesNotMatch(call, /host-only|hidden checks passed/);
	});
});
