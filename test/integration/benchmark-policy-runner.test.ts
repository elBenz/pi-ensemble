import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { runBenchmarkPlan } from "../../src/benchmark/suite.ts";
import { createMockPi } from "../support/mock-pi.ts";

const tempDirs: string[] = [];
const mocks: ReturnType<typeof createMockPi>[] = [];

afterEach(() => {
	for (const mock of mocks.splice(0)) mock.uninstall();
	for (const dir of tempDirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function writeCase(root: string, overrides: Record<string, unknown> = {}): string {
	const casePath = path.join(root, "case.json");
	fs.writeFileSync(casePath, JSON.stringify({
		id: "worker-policy",
		agentRole: "worker",
		route: { modelTier: "GPT-5.6 Terra", model: "openai-codex/gpt-5.6-terra", thinkingLevel: "high" },
		currentPricing: { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-08-27", source: "https://example.invalid/current-prices", input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		prompt: "Create done.txt.",
		evaluator: { kind: "output-includes", expected: "done" },
		timeoutMs: 2_000,
		mutationPolicy: "require",
		...overrides,
	}));
	return casePath;
}

function response(peakContextLoad: number, output = 10) {
	return {
		writeFiles: [{ path: "done.txt", content: "done\n" }],
		sessionEntries: [
			{ type: "model_change", provider: "openai-codex", modelId: "gpt-5.6-terra" },
			{ type: "thinking_level_change", thinkingLevel: "high" },
		],
		jsonl: [{
			type: "message_end",
			message: { role: "assistant", api: "openai-codex-responses", content: [{ type: "text", text: "done" }], model: "openai-codex/gpt-5.6-terra", usage: { input: 10, output, reasoning: output - 1, cacheRead: 5, cacheWrite: 0, totalTokens: peakContextLoad, cost: { total: 99 } },
				usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage: { input_tokens: 15, output_tokens: output, input_tokens_details: { cached_tokens: 5, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: output - 1 }, total_tokens: peakContextLoad } } },
		}],
	};
}

describe("benchmark plan policy", () => {
	it("reports median typical context from comparable screening repetitions", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-plan-context-"));
		tempDirs.push(root);
		writeCase(root);
		const planPath = path.join(root, "plan.json");
		fs.writeFileSync(planPath, JSON.stringify({ id: "screen-worker", stage: "screening", launches: [{ case: "case.json", repetitions: 3 }] }));
		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		for (const peak of [90_000, 100_000, 110_000]) mock.onCall(response(peak));

		const completed = await runBenchmarkPlan({ planPath, outputDir: path.join(root, "results") });
		assert.equal(completed.passed, true);
		assert.equal(mock.callCount(), 3);
		const result = JSON.parse(fs.readFileSync(completed.resultPath, "utf-8"));
		assert.equal(result.routes[0].typicalPeakContextLoad, 100_000);
		assert.equal(result.routes[0].eligible, true);
		assert.equal(result.routes[0].tailBreaches, 0);
		assert.equal(result.budget.cumulativeSpend, 0);

		const incompletePlanPath = path.join(root, "incomplete-plan.json");
		fs.writeFileSync(incompletePlanPath, JSON.stringify({ id: "screen-worker-incomplete", stage: "screening", launches: [{ case: "case.json" }] }));
		mock.onCall(response(90_000));
		const incomplete = await runBenchmarkPlan({ planPath: incompletePlanPath, outputDir: path.join(root, "incomplete-results") });
		assert.equal(incomplete.passed, false, "screening requires three comparable runs per Route");
	});

	it("lets a mutation-capable launch finish after crossing hard spend, then blocks and retains receipts", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-plan-budget-"));
		tempDirs.push(root);
		writeCase(root, { currentPricing: { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-08-27", source: "https://example.invalid/current-prices", input: 0, output: 1, cacheRead: 0, cacheWrite: 0 } });
		const planPath = path.join(root, "plan.json");
		fs.writeFileSync(planPath, JSON.stringify({ id: "screen-budget", stage: "screening", launches: [{ case: "case.json", repetitions: 2 }] }));
		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		mock.onCall(response(80_000, 25_500_000));
		const warnings: string[] = [];

		const completed = await runBenchmarkPlan({ planPath, outputDir: path.join(root, "results"), onWarning: (warning) => warnings.push(warning) });
		assert.equal(completed.blocked, true);
		assert.equal(mock.callCount(), 1, "hard limit blocks only the next launch");
		assert.equal(fs.readFileSync(path.join(root, "results", "run-001", "workspace", "done.txt"), "utf-8"), "done\n");
		assert.equal(fs.existsSync(path.join(root, "results", "run-001", "receipt.json")), true);
		const receipt = JSON.parse(fs.readFileSync(completed.receiptPath, "utf-8"));
		assert.deepEqual(receipt.decisions.map((decision: { action: string }) => decision.action), ["launched", "blocked"]);
		assert.equal(receipt.decisions[0].cumulativeSpendAfter, 25.5);
		assert.equal(warnings.length, 1);
		if (process.platform !== "win32") assert.equal(fs.statSync(completed.receiptPath).mode & 0o222, 0);
	});

	it("retains partial-usage receipts and known spend, then blocks queued mutation work", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-unknown-spend-"));
		tempDirs.push(root);
		writeCase(root, { currentPricing: { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-08-27", source: "https://example.invalid/current-prices", input: 0, output: 1, cacheRead: 0, cacheWrite: 0 } });
		const planPath = path.join(root, "plan.json");
		fs.writeFileSync(planPath, JSON.stringify({ id: "partial-usage", stage: "screening", launches: [{ case: "case.json", repetitions: 3 }] }));
		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		mock.onCall(response(80_000, 1_000_000));
		const partial = response(90_000);
		Reflect.deleteProperty(partial.jsonl[0]!.message.usageProvenance.rawUsage, "output_tokens");
		partial.jsonl[0]!.message.usage.output = 0;
		mock.onCall(partial);

		const completed = await runBenchmarkPlan({ planPath, outputDir: path.join(root, "results") });
		assert.equal(completed.blocked, true);
		assert.equal(completed.passed, false);
		assert.equal(mock.callCount(), 2);
		const result = JSON.parse(fs.readFileSync(completed.resultPath, "utf-8"));
		assert.equal(result.budget.cumulativeSpend, null, "unknown spend must not appear as a complete total");
		assert.equal(result.budget.knownSpend, 1);
		assert.equal(result.budget.complete, false);
		const runDir = path.join(root, "results", "run-002");
		const run = JSON.parse(fs.readFileSync(path.join(runDir, "result.json"), "utf-8"));
		assert.equal(run.metrics.cumulativeOutputTokens, null);
		assert.equal(run.benchmarkCost, null);
		assert.match(run.benchmarkCostUnavailableReason, /output/);
		assert.equal(run.evaluation.passed, true);
		assert.equal(run.execution.passed, true);
		assert.equal(fs.readFileSync(path.join(runDir, "workspace", "done.txt"), "utf-8"), "done\n");
		const raw = JSON.parse(fs.readFileSync(path.join(runDir, "receipt.json"), "utf-8"));
		assert.deepEqual(JSON.parse(raw.candidate.stdout.trim()), partial.jsonl[0]);
		const receipt = JSON.parse(fs.readFileSync(completed.receiptPath, "utf-8"));
		assert.deepEqual(receipt.decisions.map((decision: { action: string }) => decision.action), ["launched", "launched", "blocked"]);
		assert.match(receipt.decisions[2].reason, /unavailable/i);
		assert.match(fs.readFileSync(completed.reportPath, "utf-8"), /unavailable[\s\S]*known spend.*\$1\.000000/i);
	});

	it("keeps missing context unknown even when all billable usage is explicitly zero", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-missing-context-"));
		tempDirs.push(root);
		writeCase(root);
		const planPath = path.join(root, "plan.json");
		fs.writeFileSync(planPath, JSON.stringify({ id: "missing-context", stage: "screening", launches: [{ case: "case.json", repetitions: 3 }] }));
		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		for (let i = 0; i < 3; i += 1) {
			const turn = response(0, 0);
			Object.assign(turn.jsonl[0]!.message.usage, { input: 0, reasoning: 0, cacheRead: 0, totalTokens: -1 });
			Object.assign(turn.jsonl[0]!.message.usageProvenance.rawUsage, { input_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 }, total_tokens: -1 });
			mock.onCall(turn);
		}
		const completed = await runBenchmarkPlan({ planPath, outputDir: path.join(root, "results") });
		assert.equal(completed.passed, false);
		assert.equal(completed.blocked, false, "unknown context alone does not make known spend unknown");
		const result = JSON.parse(fs.readFileSync(completed.resultPath, "utf-8"));
		assert.equal(result.routes[0].typicalPeakContextLoad, null);
		assert.equal(result.routes[0].contextComplete, false);
		assert.equal(result.routes[0].eligible, false);
		assert.equal(result.budget.cumulativeSpend, 0);
		const run = JSON.parse(fs.readFileSync(path.join(root, "results", "run-001", "result.json"), "utf-8"));
		assert.equal(run.metrics.peakContextLoad, null);
		assert.equal(run.metrics.cumulativeOutputTokens, 0);
		assert.equal(run.contextPolicy.tailBreach, null);
		assert.match(fs.readFileSync(path.join(root, "results", "run-001", "report.md"), "utf-8"), /Tail breach: unknown/);
	});

	it("counts a proven Tail breach when the same run has incomplete context", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-partial-breach-"));
		tempDirs.push(root);
		writeCase(root);
		const planPath = path.join(root, "plan.json");
		fs.writeFileSync(planPath, JSON.stringify({ id: "partial-breach", stage: "screening", launches: [{ case: "case.json", repetitions: 3 }] }));
		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		const partial = response(160_000);
		partial.jsonl.push(response(-1).jsonl[0]!);
		mock.onCall(partial);
		mock.onCall(response(80_000));
		mock.onCall(response(90_000));

		const completed = await runBenchmarkPlan({ planPath, outputDir: path.join(root, "results") });
		const result = JSON.parse(fs.readFileSync(completed.resultPath, "utf-8"));
		assert.equal(result.routes[0].tailBreaches, 1);
		assert.equal(result.routes[0].contextComplete, false);
		assert.equal(result.routes[0].typicalPeakContextLoad, null);
		assert.equal(result.routes[0].eligible, false);
		assert.equal(completed.passed, false);
		assert.match(fs.readFileSync(completed.reportPath, "utf-8"), /1 Tail breach\(es\)/);
	});

	it("blocks the next screening launch at the $25 boundary", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-plan-hard-boundary-"));
		tempDirs.push(root);
		writeCase(root, { currentPricing: { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-08-27", source: "https://example.invalid/current-prices", input: 0, output: 1, cacheRead: 0, cacheWrite: 0 } });
		const planPath = path.join(root, "plan.json");
		fs.writeFileSync(planPath, JSON.stringify({ id: "screen-blocked", stage: "screening", launches: [{ case: "case.json", repetitions: 2 }] }));
		const mock = createMockPi();
		mocks.push(mock);
		mock.install();
		mock.onCall(response(80_000, 25_000_000));

		const completed = await runBenchmarkPlan({ planPath, outputDir: path.join(root, "results") });
		assert.equal(completed.blocked, true);
		assert.equal(mock.callCount(), 1);
		const result = JSON.parse(fs.readFileSync(completed.resultPath, "utf-8"));
		assert.equal(result.budget.warning, true);
		assert.equal(result.budget.blocked, true);
	});
});
