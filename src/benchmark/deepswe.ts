import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

export const DEEPSWE_SOURCE_URL = "https://deepswe.datacurve.ai/artifacts/v1.1/leaderboard-live.json";
const GPT_MODELS = ["gpt-6-astra", "gpt-5-6-sol", "gpt-5-6-terra", "gpt-5-6-luna"] as const;
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const SITE_PRICES: Record<string, { from: [number, number, number]; to: [number, number, number] }> = {
	"gpt-5-6-luna": { from: [1, 0.1, 6], to: [0.2, 0.02, 1.2] },
	"gpt-5-6-terra": { from: [2.5, 0.25, 15], to: [2, 0.2, 12] },
	"gpt-5-6-sol": { from: [5, 0.5, 30], to: [4, 0.4, 20] },
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type SourceRow = Record<string, Json>;

export interface DeepSweProvenance {
	sourceUrl: string;
	retrievedAt: string;
	benchmarkVersion: string;
	generatedAt: string;
	sha256: string;
	currentPricingSha256?: string;
}

export interface DeepSweCurrentPricing {
	currency: "USD";
	unit: "per-million-tokens";
	effectiveAt: string;
	source: string;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite?: number;
	computeUnit?: number;
}

export interface DeepSweCoverage {
	expected: string[];
	present: string[];
	missing: string[];
	unexpected: string[];
	complete: boolean;
}

export interface DeepSweSnapshot {
	schemaVersion: 1;
	provenance: DeepSweProvenance;
	rawArtifact: string;
	normalized: { rows: DeepSweNormalizedRow[]; gptCoverage: DeepSweCoverage };
}

export interface DeepSweNormalizedRow {
	identity: { model: string; effort: string | null; harness: string | null; provider: string | null; config: string | null; executionMode: string | null };
	classification: "gpt-route-candidate" | "comparison-baseline";
	metrics: {
		passAt1: number | null; passAt4: number | null; confidenceInterval: { low: number | null; high: number | null; halfWidth: number | null; method: string | null };
		scoredAttempts: number | null; scoredTasks: number | null; passedAttempts: number | null; passedTasksAny: number | null;
		recordedCostUsd: number | null; meanInputTokens: number | null; meanUncachedInputTokens: number | null; meanCacheTokens: number | null; meanCacheReadTokens: number | null; meanCacheWriteTokens: number | null;
		meanOutputTokens: number | null; meanReasoningTokens: number | null; meanComputeUnits: number | null; meanSteps: number | null; meanDurationSeconds: number | null;
		medianPeakContextTokens: number | null; medianOutputTokensToPass: number | null;
	};
	costs: { recordedHistoricalUsd: number | null; siteAdjustedUsd: number | null; siteAdjustment: string; currentBenchmarkUsd: number | null; currentPricing: { status: "available" | "unavailable"; reason: string; effectiveAt?: string; source?: string } };
	contextEligibility: "eligible" | "ineligible" | "unknown";
	raw: SourceRow;
}

function isRecord(value: unknown): value is Record<string, Json> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function isValidDate(value: string): boolean {
	return Number.isFinite(Date.parse(value)) && /^\d{4}-\d{2}-\d{2}(?:T[^\s]+)?$/.test(value);
}

function validUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return url.protocol === "https:" || url.protocol === "http:";
	} catch {
		return false;
	}
}

function optionalString(row: SourceRow, field: string, index: number): string | null {
	const value = row[field];
	if (value === undefined || value === null) return null;
	if (typeof value !== "string" || !value.trim()) throw new Error(`rows[${index}].${field} must be a non-empty string when present.`);
	return value;
}

function optionalNumber(row: SourceRow, field: string, index: number, options: { integer?: boolean; maximum?: number } = {}): number | null {
	const value = row[field];
	if (value === undefined || value === null) return null;
	if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || (options.integer && !Number.isInteger(value)) || (options.maximum !== undefined && value > options.maximum)) {
		throw new Error(`rows[${index}].${field} must be a ${options.integer ? "non-negative integer" : "non-negative finite number"}${options.maximum !== undefined ? ` no greater than ${options.maximum}` : ""} when present.`);
	}
	return value;
}

function requiredString(row: SourceRow, field: string, index: number): string {
	const value = optionalString(row, field, index);
	if (value === null) throw new Error(`rows[${index}].${field} must be a non-empty string.`);
	return value;
}

function assertConfidenceInterval(metrics: DeepSweNormalizedRow["metrics"], index: number): void {
	const ci = metrics.confidenceInterval;
	if (ci.low !== null && ci.high !== null && ci.low > ci.high) throw new Error(`rows[${index}].ci_lo must not exceed rows[${index}].ci_hi.`);
	const present = [ci.low, ci.high, ci.halfWidth].filter((value) => value !== null).length;
	if (present !== 0 && present !== 3) throw new Error(`rows[${index}].ci_lo, rows[${index}].ci_hi, and rows[${index}].ci_half must be present together.`);
	if (present !== 0 && ci.method === null) throw new Error(`rows[${index}].ci_method is required when confidence interval values are present.`);
	if (ci.low !== null && ci.high !== null && ci.halfWidth !== null && Math.abs((ci.high - ci.low) / 2 - ci.halfWidth) > 1e-9) {
		throw new Error(`rows[${index}].ci_half is inconsistent with rows[${index}].ci_lo and rows[${index}].ci_hi.`);
	}
}

function siteAdjustedCost(metrics: DeepSweNormalizedRow["metrics"], model: string): { amount: number | null; note: string } {
	const historical = metrics.recordedCostUsd;
	if (historical === null) return { amount: null, note: "Recorded historical cost unavailable." };
	const prices = SITE_PRICES[model];
	if (!prices) return model === "gpt-6-astra"
		? { amount: historical, note: "Captured website leaves Astra recorded cost unchanged; this is not current-price evidence." }
		: { amount: null, note: "Website repricing for this baseline is not implemented; recorded historical cost retained separately." };
	const input = metrics.meanInputTokens;
	const cached = metrics.meanCacheTokens;
	const output = metrics.meanOutputTokens;
	if (input === null || cached === null || output === null || cached > input) return { amount: null, note: "Website adjustment unavailable: input, cache, or output usage missing or malformed." };
	const oldCost = (input - cached) * prices.from[0] + cached * prices.from[1] + output * prices.from[2];
	const newCost = (input - cached) * prices.to[0] + cached * prices.to[1] + output * prices.to[2];
	const amount = historical * (newCost / oldCost);
	return oldCost > 0 && Number.isFinite(oldCost) && Number.isFinite(newCost) && Number.isFinite(amount)
		? { amount, note: "Reproduced captured website transformation; not current-price evidence." }
		: { amount: null, note: "Website adjustment unavailable: zero or invalid source price denominator." };
}

function validateCurrentPricing(pricing: Record<string, DeepSweCurrentPricing> | undefined): void {
	if (!pricing) return;
	for (const [model, rates] of Object.entries(pricing)) {
		if (!isRecord(rates)) throw new Error(`Current pricing for ${model} must be an object.`);
		if (rates.currency !== "USD") throw new Error(`Current pricing ${model}.currency must be USD.`);
		if (rates.unit !== "per-million-tokens") throw new Error(`Current pricing ${model}.unit must be per-million-tokens.`);
		if (typeof rates.effectiveAt !== "string" || !isValidDate(rates.effectiveAt)) throw new Error(`Current pricing ${model}.effectiveAt must be a valid ISO date.`);
		if (typeof rates.source !== "string" || !validUrl(rates.source)) throw new Error(`Current pricing ${model}.source must be a valid HTTP(S) URL.`);
		for (const field of ["input", "output", "cacheRead"] as const) {
			if (typeof rates[field] !== "number" || !Number.isFinite(rates[field]) || rates[field] < 0) throw new Error(`Current pricing ${model}.${field} must be a non-negative finite number.`);
		}
		for (const field of ["cacheWrite", "computeUnit"] as const) {
			if (rates[field] !== undefined && (typeof rates[field] !== "number" || !Number.isFinite(rates[field]) || rates[field] < 0)) throw new Error(`Current pricing ${model}.${field} must be a non-negative finite number.`);
		}
	}
}

function currentBenchmarkCost(metrics: DeepSweNormalizedRow["metrics"], pricing: DeepSweCurrentPricing | undefined): { amount: number | null; reason: string } {
	if (!pricing) return { amount: null, reason: "No independently dated current pricing provenance supplied; repricing would invent prices." };
	if (pricing.cacheWrite === undefined || pricing.computeUnit === undefined) return { amount: null, reason: "Current repricing unavailable: explicit cache-write and compute-unit prices are required, including explicit zero rates." };
	const input = metrics.meanInputTokens;
	const uncached = metrics.meanUncachedInputTokens;
	const cacheRead = metrics.meanCacheReadTokens ?? metrics.meanCacheTokens;
	const cacheWrite = metrics.meanCacheWriteTokens;
	const output = metrics.meanOutputTokens;
	const computeUnits = metrics.meanComputeUnits;
	if (input === null || uncached === null || cacheRead === null || cacheWrite === null || output === null || computeUnits === null) {
		return { amount: null, reason: "Current repricing unavailable: explicit uncached input, cache-read, cache-write, output, and compute-unit usage are required." };
	}
	const includedInput = uncached + cacheRead + cacheWrite;
	if (!Number.isFinite(includedInput) || Math.abs(input - includedInput) > Math.max(1e-6, input * 1e-9)) {
		return { amount: null, reason: "Current repricing unavailable: source inclusive input does not equal uncached input plus cache reads and writes." };
	}
	const amount = (uncached * pricing.input + cacheRead * pricing.cacheRead + cacheWrite * pricing.cacheWrite + output * pricing.output + computeUnits * pricing.computeUnit) / 1_000_000;
	return Number.isFinite(amount) && amount >= 0
		? { amount, reason: "Independently repriced from dated supplied pricing provenance." }
		: { amount: null, reason: "Current repricing unavailable: computed amount is invalid." };
}

function normalizeRow(row: SourceRow, index: number, currentPricing?: Record<string, DeepSweCurrentPricing>): DeepSweNormalizedRow {
	const model = requiredString(row, "model", index);
	const effort = optionalString(row, "reasoning_effort", index);
	const metrics: DeepSweNormalizedRow["metrics"] = {
		passAt1: optionalNumber(row, "pass_at_1", index, { maximum: 1 }), passAt4: optionalNumber(row, "pass_at_4", index, { maximum: 1 }),
		confidenceInterval: { low: optionalNumber(row, "ci_lo", index, { maximum: 1 }), high: optionalNumber(row, "ci_hi", index, { maximum: 1 }), halfWidth: optionalNumber(row, "ci_half", index, { maximum: 1 }), method: optionalString(row, "ci_method", index) },
		scoredAttempts: optionalNumber(row, "n_attempted", index, { integer: true }), scoredTasks: optionalNumber(row, "n_tasks_attempted", index, { integer: true }), passedAttempts: optionalNumber(row, "n_passed", index, { integer: true }), passedTasksAny: optionalNumber(row, "n_tasks_passed_any", index, { integer: true }),
		recordedCostUsd: optionalNumber(row, "mean_cost_usd", index), meanInputTokens: optionalNumber(row, "mean_input_tokens", index), meanUncachedInputTokens: optionalNumber(row, "mean_uncached_input_tokens", index), meanCacheTokens: optionalNumber(row, "mean_cache_tokens", index), meanCacheReadTokens: optionalNumber(row, "mean_cache_read_tokens", index), meanCacheWriteTokens: optionalNumber(row, "mean_cache_write_tokens", index),
		meanOutputTokens: optionalNumber(row, "mean_output_tokens", index), meanReasoningTokens: optionalNumber(row, "mean_reasoning_tokens", index), meanComputeUnits: optionalNumber(row, "mean_compute_units", index), meanSteps: optionalNumber(row, "mean_agent_steps", index), meanDurationSeconds: optionalNumber(row, "mean_duration_seconds", index), medianPeakContextTokens: optionalNumber(row, "median_peak_context_tokens", index), medianOutputTokensToPass: optionalNumber(row, "median_output_tokens_to_pass", index),
	};
	assertConfidenceInterval(metrics, index);
	if (metrics.passedAttempts !== null && metrics.scoredAttempts !== null && metrics.passedAttempts > metrics.scoredAttempts) throw new Error(`rows[${index}].n_passed must not exceed rows[${index}].n_attempted.`);
	if (metrics.passedTasksAny !== null && metrics.scoredTasks !== null && metrics.passedTasksAny > metrics.scoredTasks) throw new Error(`rows[${index}].n_tasks_passed_any must not exceed rows[${index}].n_tasks_attempted.`);
	const site = siteAdjustedCost(metrics, model);
	const current = currentBenchmarkCost(metrics, currentPricing?.[model]);
	const peak = metrics.medianPeakContextTokens;
	return {
		identity: { model, effort, harness: optionalString(row, "harness", index), provider: optionalString(row, "provider", index), config: optionalString(row, "config", index), executionMode: optionalString(row, "execution_mode", index) },
		classification: (GPT_MODELS as readonly string[]).includes(model) ? "gpt-route-candidate" : "comparison-baseline",
		metrics,
		costs: { recordedHistoricalUsd: metrics.recordedCostUsd, siteAdjustedUsd: site.amount, siteAdjustment: site.note, currentBenchmarkUsd: current.amount, currentPricing: { status: current.amount === null ? "unavailable" : "available", reason: current.reason, ...(currentPricing?.[model] ? { effectiveAt: currentPricing[model].effectiveAt, source: currentPricing[model].source } : {}) } },
		contextEligibility: peak === null ? "unknown" : peak <= 100_000 ? "eligible" : "ineligible",
		raw: row,
	};
}

function validateProvenance(provenance: Omit<DeepSweProvenance, "sha256" | "generatedAt"> & { generatedAt?: string }, generatedAt: string): void {
	if (!validUrl(provenance.sourceUrl)) throw new Error("DeepSWE provenance.sourceUrl must be a valid HTTP(S) URL.");
	if (!isValidDate(provenance.retrievedAt)) throw new Error("DeepSWE provenance.retrievedAt must be a valid ISO date.");
	if (!isValidDate(generatedAt)) throw new Error("DeepSWE provenance.generatedAt must be a valid ISO date.");
	if (provenance.benchmarkVersion !== "v1.1") throw new Error("DeepSWE provenance.benchmarkVersion must be v1.1 for this importer.");
}

function identityKey(row: DeepSweNormalizedRow): string {
	return JSON.stringify(row.identity);
}

export function normalizeDeepSweArtifact(rawArtifact: string, provenance: Omit<DeepSweProvenance, "sha256" | "generatedAt"> & { generatedAt?: string }, currentPricing?: Record<string, DeepSweCurrentPricing>): DeepSweSnapshot {
	let parsed: unknown;
	try { parsed = JSON.parse(rawArtifact); } catch { throw new Error("DeepSWE artifact is not valid JSON."); }
	if (!isRecord(parsed) || !Array.isArray(parsed.rows)) throw new Error("DeepSWE artifact must contain rows.");
	validateCurrentPricing(currentPricing);
	const generatedAt = typeof parsed.generated_at === "string" ? parsed.generated_at : provenance.generatedAt;
	if (!generatedAt) throw new Error("DeepSWE artifact lacks generated_at.");
	validateProvenance(provenance, generatedAt);
	const rows = parsed.rows.map((row, index) => {
		if (!isRecord(row)) throw new Error(`rows[${index}] must be an object.`);
		return normalizeRow(row, index, currentPricing);
	});
	const identities = new Set<string>();
	for (const row of rows) {
		const key = identityKey(row);
		if (identities.has(key)) throw new Error(`Duplicate DeepSWE full identity: ${key}.`);
		identities.add(key);
	}
	const expected = GPT_MODELS.flatMap((model) => EFFORTS.map((effort) => `${model}/${effort}`));
	const candidateKeys = [...new Set(rows.filter((row) => row.classification === "gpt-route-candidate" && row.identity.effort !== null).map((row) => `${row.identity.model}/${row.identity.effort}`))].sort();
	const present = expected.filter((key) => candidateKeys.includes(key));
	const missing = expected.filter((key) => !candidateKeys.includes(key));
	const unexpected = candidateKeys.filter((key) => !expected.includes(key));
	return { schemaVersion: 1, provenance: { ...provenance, generatedAt, sha256: createHash("sha256").update(rawArtifact).digest("hex") }, rawArtifact, normalized: { rows, gptCoverage: { expected, present, missing, unexpected, complete: missing.length === 0 } } };
}

function writeExclusive(filePath: string, content: string): void {
	const descriptor = fs.openSync(filePath, "wx", 0o444);
	try { fs.writeFileSync(descriptor, content, "utf8"); } finally { fs.closeSync(descriptor); }
	fs.chmodSync(filePath, 0o444);
}

function pricingHash(pricing: Record<string, DeepSweCurrentPricing>): string {
	return createHash("sha256").update(JSON.stringify(pricing)).digest("hex");
}

export function importDeepSweSnapshot(options: { artifactPath: string; outputDir: string; provenance: Omit<DeepSweProvenance, "sha256" | "generatedAt"> & { generatedAt?: string }; currentPricing?: Record<string, DeepSweCurrentPricing> }): { snapshotDir: string; snapshot: DeepSweSnapshot } {
	const rawArtifact = fs.readFileSync(options.artifactPath, "utf8");
	const normalized = normalizeDeepSweArtifact(rawArtifact, options.provenance, options.currentPricing);
	const currentPricingSha256 = options.currentPricing ? pricingHash(options.currentPricing) : undefined;
	const snapshot: DeepSweSnapshot = { ...normalized, provenance: { ...normalized.provenance, ...(currentPricingSha256 ? { currentPricingSha256 } : {}) } };
	const priceSuffix = currentPricingSha256 ? `-${currentPricingSha256.slice(0, 8)}` : "-unpriced";
	const snapshotDir = path.resolve(options.outputDir, `deepswe-${snapshot.provenance.benchmarkVersion}-${snapshot.provenance.sha256.slice(0, 12)}${priceSuffix}`);
	fs.mkdirSync(path.resolve(options.outputDir), { recursive: true });
	try {
		fs.mkdirSync(snapshotDir, { mode: 0o755 });
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Immutable snapshot already exists: ${snapshotDir}`);
		throw error;
	}
	try {
		writeExclusive(path.join(snapshotDir, "leaderboard-live.json"), rawArtifact);
		writeExclusive(path.join(snapshotDir, "provenance.json"), `${JSON.stringify(snapshot.provenance, null, 2)}\n`);
		writeExclusive(path.join(snapshotDir, "normalized.json"), `${JSON.stringify(snapshot.normalized, null, 2)}\n`);
		if (options.currentPricing) writeExclusive(path.join(snapshotDir, "current-pricing.json"), `${JSON.stringify(options.currentPricing, null, 2)}\n`);
	} catch (error) {
		fs.rmSync(snapshotDir, { recursive: true, force: true });
		throw error;
	}
	return { snapshotDir, snapshot };
}

function number(value: number | null, digits = 3): string {
	return value === null ? "unknown" : value.toFixed(digits);
}

function name(row: DeepSweNormalizedRow): string {
	return `${row.identity.model}/${row.identity.effort ?? "unknown"} [${row.identity.harness ?? "unknown harness"}; ${row.identity.executionMode ?? "unknown mode"}]`;
}

function axes(row: DeepSweNormalizedRow, context: boolean, cost: "current" | "site"): Array<number | null> {
	return [row.metrics.passAt1, cost === "current" ? row.costs.currentBenchmarkUsd : row.costs.siteAdjustedUsd, row.metrics.meanOutputTokens, ...(context ? [row.metrics.medianPeakContextTokens] : [])];
}

function hasCompleteAxes(row: DeepSweNormalizedRow, context: boolean, cost: "current" | "site"): boolean {
	return axes(row, context, cost).every((value) => value !== null && Number.isFinite(value));
}

function dominates(left: DeepSweNormalizedRow, right: DeepSweNormalizedRow, context: boolean, cost: "current" | "site"): boolean {
	const l = axes(left, context, cost) as number[];
	const r = axes(right, context, cost) as number[];
	return l[0]! >= r[0]! && l.slice(1).every((value, index) => value <= r[index + 1]!) && l.some((value, index) => value !== r[index]!);
}

function frontier(rows: DeepSweNormalizedRow[], context: boolean, cost: "current" | "site"): DeepSweNormalizedRow[] {
	const complete = rows.filter((row) => hasCompleteAxes(row, context, cost));
	return complete.filter((row) => !complete.some((other) => other !== row && dominates(other, row, context, cost)));
}

function identityDescription(row: DeepSweNormalizedRow): string {
	const i = row.identity;
	return `${i.model}/${i.effort ?? "unknown"}; harness=${i.harness ?? "unknown"}; provider=${i.provider ?? "unknown"}; config=${i.config ?? "unknown"}; mode=${i.executionMode ?? "unknown"}`;
}

export function generateDeepSweReport(snapshot: Pick<DeepSweSnapshot, "provenance" | "normalized">): string {
	const rows = snapshot.normalized.rows;
	const gpt = rows.filter((row) => row.classification === "gpt-route-candidate").sort((a, b) => (GPT_MODELS.indexOf(a.identity.model as typeof GPT_MODELS[number]) - GPT_MODELS.indexOf(b.identity.model as typeof GPT_MODELS[number])) || EFFORTS.indexOf(a.identity.effort as typeof EFFORTS[number]) - EFFORTS.indexOf(b.identity.effort as typeof EFFORTS[number]));
	const eligible = gpt.filter((row) => row.contextEligibility === "eligible");
	const currentComplete = snapshot.normalized.gptCoverage.complete && gpt.every((row) => hasCompleteAxes(row, false, "current"));
	const fourAxis = currentComplete ? frontier(eligible, true, "current") : [];
	const provisional = frontier(gpt, false, currentComplete ? "current" : "site");
	const coverage = snapshot.normalized.gptCoverage;
	const lines = ["# DeepSWE v1.1 offline evidence report", "", `- Evidence anchor: ${snapshot.provenance.sourceUrl}`, `- Source generated: ${snapshot.provenance.generatedAt}`, `- Retrieved: ${snapshot.provenance.retrievedAt}`, `- SHA-256: ${snapshot.provenance.sha256}`, `- Benchmark version: ${snapshot.provenance.benchmarkVersion}`, ...(snapshot.provenance.currentPricingSha256 ? [`- Current-pricing SHA-256: ${snapshot.provenance.currentPricingSha256}`] : []), "", "## Coverage", "", `- Expected GPT model/effort keys: ${coverage.present.length}/20${coverage.complete ? " complete" : `; missing ${coverage.missing.join(", ")}`}.`, ...(coverage.unexpected.length ? [`- Unexpected GPT efforts retained separately: ${coverage.unexpected.join(", ")}.`] : []), `- Retained comparison baselines: ${rows.filter((row) => row.classification === "comparison-baseline").length}; never Route recommendations.`, "", "## Every GPT configuration", "", "| Model | Effort | Harness/config/mode | Pass@1 ± CI | Recorded $ | Site-adjusted $ | Current Benchmark $ | Output | Steps | Duration s | Peak context | Eligibility |", "|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|"];
	for (const row of gpt) {
		const m = row.metrics;
		lines.push(`| ${row.identity.model} | ${row.identity.effort ?? "unknown"} | ${identityDescription(row).replace(`${row.identity.model}/${row.identity.effort ?? "unknown"}; ` , "")} | ${number(m.passAt1 === null ? null : m.passAt1 * 100, 2)} ± ${number(m.confidenceInterval.halfWidth === null ? null : m.confidenceInterval.halfWidth * 100, 2)} | ${number(row.costs.recordedHistoricalUsd)} | ${number(row.costs.siteAdjustedUsd)} | ${number(row.costs.currentBenchmarkUsd)} | ${number(m.meanOutputTokens, 0)} | ${number(m.meanSteps, 1)} | ${number(m.meanDurationSeconds, 1)} | ${number(m.medianPeakContextTokens, 0)} | ${row.contextEligibility} |`);
	}
	lines.push("", currentComplete ? "Current Benchmark costs use complete supplied dated pricing and usage provenance retained in this snapshot." : "Current Benchmark evidence is incomplete: expected configurations, pricing, or usage are missing; missing values are explicit, never zero. Captured site adjustment remains auditable but is not current pricing. Reasoning tokens are retained but never charged separately from output.", "", "## Point-estimate Pareto", "", currentComplete ? `Four-axis eligible frontier (score, current Benchmark cost, cumulative output, Peak context; complete-axis evidence only): ${fourAxis.map(name).join(", ") || "none"}.` : "Four-axis eligible frontier unavailable because expected configuration coverage or complete current-price evidence is absent; rows with missing context or pricing are neither dominated nor eligible.", "", currentComplete ? `Provisional comparison (context omitted; score, current Benchmark cost, output; complete-axis subset): ${provisional.map(name).join(", ") || "none"}.` : `Provisional comparison (context omitted; score, captured site-adjusted cost, output; complete-axis subset): **not a Benchmark-cost frontier**. Candidate set: ${provisional.map(name).join(", ") || "none"}.`, "Rows without context, pricing, or another required axis remain unknown and are excluded from the relevant frontier rather than treated as dominated. Point estimates and overlapping confidence intervals do not establish significant gains. Aggregate median context cannot establish nine-run Tail breach compliance.", "", "## Marginal effort deltas", "", "| Model | Harness/provider/mode | Change | Score pp | Recorded cost Δ | Output Δ | Steps Δ | Duration Δ | Context Δ |", "|---|---|---:|---:|---:|---:|---:|---:|---:|");
	for (const model of GPT_MODELS) {
		const groups = new Map<string, DeepSweNormalizedRow[]>();
		for (const row of gpt.filter((candidate) => candidate.identity.model === model && (EFFORTS as readonly (string | null)[]).includes(candidate.identity.effort))) {
			const key = JSON.stringify([row.identity.harness, row.identity.provider, row.identity.executionMode]);
			const group = groups.get(key) ?? [];
			group.push(row);
			groups.set(key, group);
		}
		for (const group of groups.values()) {
			if (new Set(group.map((row) => row.identity.effort)).size !== group.length) {
				lines.push(`\nEffort deltas unavailable for ${model}: multiple configurations share an effort within the same harness/provider/mode.\n`);
				continue;
			}
			group.sort((a, b) => EFFORTS.indexOf(a.identity.effort as typeof EFFORTS[number]) - EFFORTS.indexOf(b.identity.effort as typeof EFFORTS[number]));
			for (let index = 1; index < group.length; index += 1) {
				const a = group[index - 1]!;
				const b = group[index]!;
				const pct = (x: number | null, y: number | null) => x === null || y === null || x === 0 ? "unknown" : `${((y / x - 1) * 100).toFixed(1)}%`;
				lines.push(`| ${model} | ${a.identity.harness ?? "unknown"}/${a.identity.provider ?? "unknown"}/${a.identity.executionMode ?? "unknown"} | ${a.identity.effort} → ${b.identity.effort} | ${number(a.metrics.passAt1 === null || b.metrics.passAt1 === null ? null : (b.metrics.passAt1 - a.metrics.passAt1) * 100, 2)} | ${pct(a.costs.recordedHistoricalUsd, b.costs.recordedHistoricalUsd)} | ${pct(a.metrics.meanOutputTokens, b.metrics.meanOutputTokens)} | ${pct(a.metrics.meanSteps, b.metrics.meanSteps)} | ${pct(a.metrics.meanDurationSeconds, b.metrics.meanDurationSeconds)} | ${a.metrics.medianPeakContextTokens === null || b.metrics.medianPeakContextTokens === null ? "unknown" : String(b.metrics.medianPeakContextTokens - a.metrics.medianPeakContextTokens)} |`);
			}
		}
	}
	return `${lines.join("\n")}\n`;
}

export function regenerateDeepSweReport(snapshotDir: string, outputDir: string): { reportPath: string } {
	const resolvedSnapshot = path.resolve(snapshotDir);
	const rawArtifact = fs.readFileSync(path.join(resolvedSnapshot, "leaderboard-live.json"), "utf8");
	const provenance = JSON.parse(fs.readFileSync(path.join(resolvedSnapshot, "provenance.json"), "utf8")) as DeepSweProvenance;
	const pricingPath = path.join(resolvedSnapshot, "current-pricing.json");
	const currentPricing = fs.existsSync(pricingPath) ? JSON.parse(fs.readFileSync(pricingPath, "utf8")) as Record<string, DeepSweCurrentPricing> : undefined;
	if (Boolean(provenance.currentPricingSha256) !== Boolean(currentPricing) || (currentPricing && provenance.currentPricingSha256 !== pricingHash(currentPricing))) {
		throw new Error("Current-pricing provenance checksum mismatch; refusing regeneration.");
	}
	const snapshot = normalizeDeepSweArtifact(rawArtifact, provenance, currentPricing);
	if (snapshot.provenance.sha256 !== provenance.sha256) throw new Error("Snapshot checksum mismatch; refusing regeneration.");
	const target = path.resolve(outputDir);
	if (fs.existsSync(target)) throw new Error(`Output directory already exists: ${target}`);
	fs.mkdirSync(target, { recursive: true });
	const reportPath = path.join(target, "report.md");
	writeExclusive(reportPath, generateDeepSweReport({ ...snapshot, provenance }));
	writeExclusive(path.join(target, "normalized.json"), `${JSON.stringify(snapshot.normalized, null, 2)}\n`);
	return { reportPath };
}
