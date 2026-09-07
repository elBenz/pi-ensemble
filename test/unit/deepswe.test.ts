import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { calculateBenchmarkCost } from "../../src/benchmark/policy.ts";
import { generateDeepSweReport, importDeepSweSnapshot, normalizeDeepSweArtifact, regenerateDeepSweReport, type DeepSweCurrentPricing } from "../../src/benchmark/deepswe.ts";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
const provenance = { sourceUrl: "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json", retrievedAt: "2026-09-07T11:37:08.124933+00:00", benchmarkVersion: "v1.1" };
const pricing: DeepSweCurrentPricing = { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-09-07", source: "https://example.invalid/prices", input: 12, output: 50, cacheRead: 1.2, cacheWrite: 15, computeUnit: 2 };

function root(): string { const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-deepswe-")); dirs.push(dir); return dir; }
function artifact(rows: unknown[]): string { return JSON.stringify({ generated_at: "2026-09-03T00:00:00Z", rows }); }
function row(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return { model: "gpt-6-astra", reasoning_effort: "low", harness: "h", provider: "p", config: "c", execution_mode: "batch", pass_at_1: 0.5, mean_cost_usd: 1, mean_input_tokens: 17, mean_uncached_input_tokens: 2, mean_cache_read_tokens: 3, mean_cache_write_tokens: 12, mean_output_tokens: 4, mean_compute_units: 5, median_peak_context_tokens: 10, ...overrides };
}

describe("DeepSWE offline evidence", () => {
	it("normalizes source, retains baselines, and reprices Astra without double-counting cache writes", () => {
		const raw = fs.readFileSync(path.resolve("docs/research/deepswe-refresh/leaderboard-live.json"), "utf8");
		const snapshot = normalizeDeepSweArtifact(raw, provenance, { "gpt-6-astra": pricing });
		assert.equal(snapshot.normalized.rows.length, 70);
		assert.equal(snapshot.normalized.gptCoverage.complete, true);
		assert.equal(snapshot.normalized.gptCoverage.present.length, 20);
		const astra = snapshot.normalized.rows.find((candidate) => candidate.identity.model === "gpt-6-astra" && candidate.identity.effort === "high");
		assert.equal(astra?.contextEligibility, "unknown");
		assert.equal(astra?.costs.currentPricing.status, "available");
		assert.ok(Math.abs((astra?.costs.currentBenchmarkUsd ?? 0) - 5.723721956194691) < 1e-12);
		assert.equal(snapshot.normalized.rows.find((candidate) => candidate.identity.model === "gpt-5-6-sol")?.costs.currentBenchmarkUsd, null, "legacy missing explicit usage is unavailable");
		assert.equal(snapshot.normalized.rows.some((candidate) => candidate.classification === "comparison-baseline"), true);
		assert.match(generateDeepSweReport(snapshot), /missing context or pricing are neither dominated nor eligible/);
	});

	it("rejects malformed metrics, incomplete pricing, invalid provenance, and duplicate identities", () => {
		for (const [field, value] of [["pass_at_1", 1.1], ["mean_output_tokens", -1], ["n_attempted", 1.5], ["median_peak_context_tokens", "bad"], ["ci_half", -1]] as const) {
			assert.throws(() => normalizeDeepSweArtifact(artifact([row({ [field]: value })]), provenance), new RegExp(`rows\\[0\\]\\.${field}`));
		}
		assert.throws(() => normalizeDeepSweArtifact(artifact([row(), row()]), provenance), /Duplicate DeepSWE full identity/);
		assert.throws(() => normalizeDeepSweArtifact(artifact([row()]), { ...provenance, sourceUrl: "not-a-url" }), /sourceUrl/);
		assert.throws(() => normalizeDeepSweArtifact(artifact([row()]), provenance, { "gpt-6-astra": { ...pricing, currency: "EUR" } as unknown as DeepSweCurrentPricing }), /currency/);
		const incomplete = normalizeDeepSweArtifact(artifact([row({ mean_cache_write_tokens: null })]), provenance, { "gpt-6-astra": { ...pricing, cacheWrite: undefined } });
		assert.equal(incomplete.normalized.rows[0]?.costs.currentPricing.status, "unavailable");
	});

	it("deduplicates expected coverage, lists unexpected efforts, and excludes missing axes from frontiers", () => {
		const rows = [row({ reasoning_effort: "low", config: "one" }), row({ reasoning_effort: "turbo", config: "two" }), row({ model: "gpt-5-6-sol", reasoning_effort: "low", config: "three", mean_uncached_input_tokens: null })];
		const snapshot = normalizeDeepSweArtifact(artifact(rows), provenance, { "gpt-6-astra": pricing, "gpt-5-6-sol": pricing });
		assert.deepEqual(snapshot.normalized.gptCoverage.present, ["gpt-6-astra/low", "gpt-5-6-sol/low"]);
		assert.deepEqual(snapshot.normalized.gptCoverage.unexpected, ["gpt-6-astra/turbo"]);
		const report = generateDeepSweReport(snapshot);
		assert.match(report, /Unexpected GPT efforts retained separately/);
		assert.match(report, /rows with missing context or pricing are neither dominated nor eligible/);
	});

	it("writes price-hashed immutable snapshots and refuses tampered pricing during deterministic offline regeneration", () => {
		const dir = root();
		const source = path.join(dir, "artifact.json");
		const output = path.join(dir, "snapshots");
		const raw = fs.readFileSync(path.resolve("docs/research/deepswe-refresh/leaderboard-live.json"), "utf8");
		fs.writeFileSync(source, raw);
		const first = importDeepSweSnapshot({ artifactPath: source, outputDir: output, provenance, currentPricing: { "gpt-6-astra": pricing } });
		assert.match(first.snapshot.provenance.currentPricingSha256 ?? "", /^[a-f0-9]{64}$/);
		const one = regenerateDeepSweReport(first.snapshotDir, path.join(dir, "report-one"));
		const two = regenerateDeepSweReport(first.snapshotDir, path.join(dir, "report-two"));
		assert.equal(fs.readFileSync(one.reportPath, "utf8"), fs.readFileSync(two.reportPath, "utf8"));
		const pricePath = path.join(first.snapshotDir, "current-pricing.json");
		fs.chmodSync(pricePath, 0o644);
		fs.writeFileSync(pricePath, JSON.stringify({ "gpt-6-astra": { ...pricing, input: 99 } }));
		assert.throws(() => regenerateDeepSweReport(first.snapshotDir, path.join(dir, "tampered")), /pricing provenance checksum mismatch/);
	});

	it("uses current rather than site prices for complete frontiers and labels partial coverage", () => {
		const models = ["gpt-6-astra", "gpt-5-6-sol", "gpt-5-6-terra", "gpt-5-6-luna"];
		const efforts = ["low", "medium", "high", "xhigh", "max"];
		const completeRows = models.flatMap((model) => efforts.map((effort) => row({
			model, reasoning_effort: effort, config: `${model}-${effort}`, mean_cache_tokens: 3,
		})));
		const rates = Object.fromEntries(models.map((model) => [model, {
			...pricing, input: model === "gpt-5-6-sol" ? 0 : 1000,
		}]));
		const report = generateDeepSweReport(normalizeDeepSweArtifact(artifact(completeRows), provenance, rates));
		const provisional = report.split("\n").find((line) => line.startsWith("Provisional comparison"));
		assert.match(provisional ?? "", /current Benchmark cost/);
		assert.match(provisional ?? "", /gpt-5-6-sol\/low/);
		assert.doesNotMatch(provisional ?? "", /gpt-5-6-luna|gpt-6-astra/);
		const partial = generateDeepSweReport(normalizeDeepSweArtifact(artifact([row()]), provenance, { "gpt-6-astra": pricing }));
		assert.match(partial, /expected configurations, pricing, or usage are missing/);
		assert.match(partial, /Four-axis eligible frontier unavailable/);
		assert.match(partial, /not a Benchmark-cost frontier/);
	});

	it("rejects missing rates and keeps incomplete usage out of current costs", () => {
		for (const field of ["input", "output", "cacheRead"] as const) {
			const invalid = { ...pricing, [field]: undefined } as unknown as DeepSweCurrentPricing;
			assert.throws(() => normalizeDeepSweArtifact(artifact([row()]), provenance, { "gpt-6-astra": invalid }), new RegExp(field));
		}
		for (const field of ["mean_compute_units", "mean_cache_write_tokens", "mean_uncached_input_tokens"] as const) {
			const snapshot = normalizeDeepSweArtifact(artifact([row({ [field]: null })]), provenance, { "gpt-6-astra": pricing });
			assert.equal(snapshot.normalized.rows[0]?.costs.currentBenchmarkUsd, null);
		}
		assert.throws(() => normalizeDeepSweArtifact(artifact([row()]), provenance, { "gpt-6-astra": { ...pricing, effectiveAt: "nonsense" } }), /effectiveAt/);
	});

	it("preserves changed-source snapshots and rejects tampered raw bytes", () => {
		const dir = root();
		const source = path.join(dir, "source.json");
		const options = { artifactPath: source, outputDir: path.join(dir, "snapshots"), provenance };
		fs.writeFileSync(source, artifact([row()]));
		const first = importDeepSweSnapshot(options);
		assert.throws(() => importDeepSweSnapshot(options), /already exists/);
		fs.appendFileSync(source, "\n");
		const second = importDeepSweSnapshot(options);
		assert.notEqual(first.snapshotDir, second.snapshotDir);
		const rawPath = path.join(first.snapshotDir, "leaderboard-live.json");
		fs.chmodSync(rawPath, 0o644);
		fs.appendFileSync(rawPath, "\n");
		assert.throws(() => regenerateDeepSweReport(first.snapshotDir, path.join(dir, "report")), /Snapshot checksum mismatch/);
	});

	it("charges compute units only with complete matching evidence", () => {
		assert.equal(calculateBenchmarkCost({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, computeUnits: 1_500_000 }, pricing).amount, 3);
		assert.throws(() => calculateBenchmarkCost({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 }, pricing), /requires compute-unit usage/);
		assert.throws(() => calculateBenchmarkCost({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, computeUnits: 1 }, { ...pricing, computeUnit: undefined }), /requires compute-unit pricing/);
	});
});
