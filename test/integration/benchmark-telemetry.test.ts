import assert from "node:assert/strict";
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

const usage = { input: 100, output: 20, cacheRead: 10, cacheWrite: 0, totalTokens: 130, cost: { total: 1 } };
const rawUsage = { input_tokens: 110, output_tokens: 20, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 }, total_tokens: 130 };
const rawZero = { input_tokens: 0, output_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, total_tokens: 0 };
function message(turnUsage: unknown, raw: unknown = rawUsage) {
	return { type: "message_end", message: { role: "assistant", api: "openai-codex-responses", model: "openai-codex/gpt-5.6-luna", content: [{ type: "text", text: "done" }], usage: turnUsage, usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage: raw } } };
}

async function runTurns(turns: unknown[], stdoutRaw?: string) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-telemetry-"));
	tempDirs.push(root);
	const casePath = path.join(root, "case.json");
	fs.writeFileSync(casePath, JSON.stringify({
		id: "telemetry", agentRole: "scout",
		route: { modelTier: "GPT-5.6 Luna", model: "openai-codex/gpt-5.6-luna", thinkingLevel: "low" },
		currentPricing: { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-09-07", source: "https://example.invalid/pricing", input: 1, output: 2, cacheRead: 0.5, cacheWrite: 3 },
		prompt: "Report done.", evaluator: { kind: "output-includes", expected: "done" }, timeoutMs: 2_000, mutationPolicy: "forbid",
	}));
	const mock = createMockPi();
	mocks.push(mock);
	mock.install();
	mock.onCall({ sessionEntries: [{ type: "model_change", provider: "openai-codex", modelId: "gpt-5.6-luna" }, { type: "thinking_level_change", thinkingLevel: "low" }], jsonl: turns, ...(stdoutRaw === undefined ? {} : { stdoutRaw }) });
	const completed = await runBenchmarkCase({ casePath, outputDir: path.join(root, "result") });
	return { completed, result: JSON.parse(fs.readFileSync(completed.resultPath, "utf-8")), receipt: JSON.parse(fs.readFileSync(completed.receiptPath, "utf-8")), report: fs.readFileSync(completed.reportPath, "utf-8") };
}

describe("benchmark telemetry completeness", () => {
	it("does not price adapter zeros without raw provider presence evidence", async () => {
		const turn = message({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { total: 0 } });
		Reflect.deleteProperty(turn.message, "usageProvenance");
		const { result, receipt } = await runTurns([turn]);
		assert.equal(result.benchmarkCost, null);
		assert.match(result.benchmarkCostUnavailableReason, /provider usage provenance/i);
		assert.equal(result.metrics.cumulativeInputTokens, null);
		assert.equal(result.metrics.peakContextLoad, null);
		assert.equal(result.telemetry.passed, false);
		assert.match(receipt.candidate.stdout, /"input":0/);
	});

	it("distinguishes omitted raw fields from reported zeros even after identical adapter normalization", async () => {
		const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { total: 0 } };
		for (const rawUsage of [
			{ input_tokens: 0, output_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, total_tokens: 0 },
			{ output_tokens: 0, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, total_tokens: 0 },
		]) {
			const turn = message(zero);
			const { result, receipt } = await runTurns([{ ...turn, message: { ...turn.message, api: "openai-codex-responses", usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage } } }]);
			assert.equal(result.benchmarkCost?.amount ?? null, "input_tokens" in rawUsage ? 0 : null);
			assert.equal(result.metrics.cumulativeInputTokens, "input_tokens" in rawUsage ? 0 : null);
			assert.deepEqual(JSON.parse(receipt.candidate.stdout.trim()).message.usageProvenance.rawUsage, rawUsage);
		}
	});

	it("prices raw cache categories without double-charging input or reasoning", async () => {
		const { result } = await runTurns([
			message(usage, { input_tokens: 120, output_tokens: 10, input_tokens_details: { cached_tokens: 20, cache_write_tokens: 30 }, output_tokens_details: { reasoning_tokens: 7 }, total_tokens: 130 }),
			message(usage, { input_tokens: 60, output_tokens: 10, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 5 }, output_tokens_details: { reasoning_tokens: 2 } }),
		]);
		assert.equal(result.passed, true);
		assert.equal(result.metrics.cumulativeInputTokens, 115);
		assert.equal(result.metrics.cumulativeOutputTokens, 20);
		assert.equal(result.metrics.cacheReadTokens, 30);
		assert.equal(result.metrics.cacheWriteTokens, 35);
		assert.equal(result.metrics.reasoningTokens, 9);
		assert.equal(result.metrics.peakContextLoad, 130, "missing raw total falls back to complete categories, not normalized total");
		assert.equal(result.benchmarkCost.amount, 0.000275);
	});

	it("preserves unknown token and historical-cost totals across complete and incomplete turns", async () => {
		const { result, report } = await runTurns([
			message(usage),
			message({ ...usage, input: 0, output: 20, cacheRead: 0, cacheWrite: 0, cost: undefined, totalTokens: 0 }, { input_tokens: -1, output_tokens: "20", input_tokens_details: { cached_tokens: null } }),
			message(usage),
		]);
		assert.equal(result.benchmarkCost, null);
		assert.match(result.benchmarkCostUnavailableReason, /input invalid[\s\S]*output invalid[\s\S]*cacheRead invalid[\s\S]*cacheWrite missing/);
		for (const field of ["cumulativeInputTokens", "cumulativeOutputTokens", "cacheReadTokens", "cacheWriteTokens", "reasoningTokens", "reportedCost", "peakContextLoad"]) assert.equal(result.metrics[field], null, field);
		assert.equal(result.recordedHistoricalCost.amount, null, "a partial provider total is not historical run cost");
		assert.equal(result.telemetry.passed, false);
		assert.match(report, /Reasoning tokens: unknown/);
		assert.match(report, /Recorded historical cost: unavailable/);
	});

	it("rejects missing, malformed and inconsistent raw counters rather than repairing adapter defaults", async () => {
		for (const raw of [
			null, [], "bad", {},
			{ ...rawUsage, output_tokens: undefined },
			{ ...rawUsage, input_tokens_details: { cache_write_tokens: 0 } },
			{ ...rawUsage, input_tokens_details: { cached_tokens: 0 } },
			{ ...rawUsage, input_tokens_details: { cached_tokens: -1, cache_write_tokens: 0 } },
			{ ...rawUsage, input_tokens: 5 },
			{ ...rawUsage, output_tokens: "20" },
			{ ...rawUsage, output_tokens: Number.POSITIVE_INFINITY },
		]) {
			const { result } = await runTurns([message(usage, raw)]);
			assert.equal(result.benchmarkCost, null, JSON.stringify(raw));
			assert.equal(result.telemetry.passed, false);
		}
	});

	it("does not accept provenance from an unsupported schema or API", async () => {
		for (const changes of [
			{ api: "anthropic-messages" },
			{ usageProvenance: { schemaVersion: 2, source: "openai-responses", rawUsage } },
			{ usageProvenance: { schemaVersion: 1, source: "caller-assertion", rawUsage } },
		]) {
			const turn = message(usage);
			const { result } = await runTurns([{ ...turn, message: { ...turn.message, ...changes } }]);
			assert.equal(result.benchmarkCost, null);
			assert.match(result.benchmarkCostUnavailableReason, /provider usage provenance/i);
		}
	});

	it("does not price interrupted turns from adapter-initialized zeros", async () => {
		const turn = message({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { total: 0 } });
		const { result, receipt } = await runTurns([{ ...turn, message: { ...turn.message, stopReason: "error", errorMessage: "Transport lost after generation started" } }]);
		assert.equal(result.benchmarkCost, null);
		assert.match(result.benchmarkCostUnavailableReason, /error/);
		assert.equal(result.telemetry.passed, false);
		assert.match(receipt.candidate.stdout, /Transport lost/);
	});

	it("keeps an unclosed assistant turn out of current cost instead of pricing only completed turns", async () => {
		const { result, receipt } = await runTurns([message(usage), { type: "message_start", message: { role: "assistant" } }, { type: "message_update", usage: { input: 200, output: 5 } }]);
		assert.equal(result.benchmarkCost, null);
		assert.match(result.benchmarkCostUnavailableReason, /unfinished assistant turn/i);
		assert.equal(result.metrics.cumulativeInputTokens, null);
		assert.equal(result.metrics.peakContextLoad, null);
		assert.equal(result.recordedHistoricalCost.amount, null);
		assert.equal(result.telemetry.passed, false);
		assert.match(receipt.candidate.stdout, /message_update/);
	});

	it("retains a proven Tail breach despite missing or unfinished context in either turn order", async () => {
		const breach = message({ ...usage, totalTokens: 160_000 }, { ...rawUsage, total_tokens: 160_000 });
		const missing = message(undefined, null);
		const unfinished = { type: "message_start", message: { role: "assistant" } };
		for (const turns of [[breach, missing], [missing, breach], [breach, unfinished]]) {
			const { result, report } = await runTurns(turns);
			assert.equal(result.metrics.peakContextLoad, null);
			assert.equal(result.telemetry.passed, false);
			assert.equal(result.contextPolicy.tailBreach, true);
			assert.match(report, /Peak context load: unknown/);
			assert.match(report, /Tail breach: yes/);
		}
	});

	it("prices explicit zeros without inventing missing reasoning and ignores streaming usage duplicates", async () => {
		const zero = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { total: 0 } };
		const { result } = await runTurns([
			{ type: "message_start", message: { role: "assistant" } },
			{ type: "message_update", usage: { input: 900_000, output: 500_000 } },
			message(zero, rawZero),
		]);
		assert.equal(result.passed, true);
		assert.equal(result.metrics.cumulativeInputTokens, 0);
		assert.equal(result.metrics.cumulativeOutputTokens, 0);
		assert.equal(result.metrics.reasoningTokens, null);
		assert.equal(result.metrics.peakContextLoad, 0);
		assert.equal(result.benchmarkCost.amount, 0);
		assert.equal("reasoning" in result.benchmarkCost.usage, false);
		assert.equal(result.recordedHistoricalCost.amount, 0);
		assert.equal(result.telemetry.usageSource, "Pi message_end.message.usageProvenance.rawUsage (raw Responses usage)");
		assert.equal(result.telemetry.computeUnits.status, "unsupported");
		assert.equal(result.metrics.computeUnits, null);
	});

	it("does not ignore a malformed transcript record when calculating spend", async () => {
		const { result, receipt } = await runTurns([], `${JSON.stringify(message(usage))}\n{"type":"message_end","message":\n`);
		assert.equal(result.benchmarkCost, null);
		assert.match(result.benchmarkCostUnavailableReason, /malformed transcript/i);
		assert.equal(result.telemetry.passed, false);
		assert.match(receipt.candidate.stdout, /"message":\n$/);
	});

	it("marks compaction spend unavailable when summary usage is outside terminal assistant telemetry", async () => {
		const { result } = await runTurns([message(usage), { type: "compaction_start" }, { type: "compaction_end" }, message(usage)]);
		assert.equal(result.benchmarkCost, null);
		assert.match(result.benchmarkCostUnavailableReason, /compaction.*usage/i);
		assert.equal(result.telemetry.passed, false);
	});

	it("does not turn absent assistant usage into a free zero-context run", async () => {
		const { result, receipt, report } = await runTurns([{ type: "agent_end", messages: [] }]);
		assert.equal(result.benchmarkCost, null);
		assert.equal(result.metrics.cumulativeInputTokens, null);
		assert.equal(result.metrics.cumulativeOutputTokens, null);
		assert.equal(result.metrics.peakContextLoad, null);
		assert.equal(result.telemetry.passed, false);
		assert.match(result.benchmarkCostUnavailableReason, /no assistant usage/i);
		assert.match(report, /Peak context load: unknown/);
		assert.match(receipt.candidate.stdout, /agent_end/);
	});
});
