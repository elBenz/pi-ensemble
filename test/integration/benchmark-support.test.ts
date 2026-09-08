import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseBenchmarkCase, runBenchmarkCase } from "../../src/benchmark/runner.ts";
import { createMockPi } from "../support/mock-pi.ts";

const corpus = path.resolve(import.meta.dirname, "../../benchmarks/support");
const roots: string[] = [];
const mocks: ReturnType<typeof createMockPi>[] = [];
afterEach(() => {
	for (const mock of mocks.splice(0)) mock.uninstall();
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

const historicalDiscovery = { discoveries: [
	{ path: "src/shared/atomic-json.ts", symbol: "createAtomicJsonWriter", quote: "const retryRenameErrors = options.retryRenameErrors ?? process.platform === \"win32\";" },
	{ path: "src/shared/atomic-json.ts", symbol: "renameWithRetry", quote: "if (delayMs === undefined || !isRetryableRenameError(error)) throw error;" },
] };

function referenceHandoff(id: string, value: unknown): string {
	const answer = structuredClone(value) as { discoveries?: Array<{ path: string; symbol: string; quote: string; startLine?: number; endLine?: number }>; claims?: Array<{ id: string; value: unknown; citations: Array<{ url: string }> }> };
	if (id.startsWith("scout-") && answer.discoveries) {
		const definition = JSON.parse(fs.readFileSync(path.join(corpus, id, "case.json"), "utf8"));
		for (const entry of answer.discoveries) {
			const file = path.resolve(corpus, id, definition.fixture, entry.path);
			const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
			entry.startLine ??= source.slice(0, Math.max(0, source.indexOf(entry.quote))).split("\n").length;
			entry.endLine ??= entry.startLine + entry.quote.split("\n").length - 1;
		}
		return `# Code Context\n\n## Change seam\n${answer.discoveries.map((entry) => `- ${entry.path}:${entry.startLine}-${entry.endLine} — ${entry.symbol}`).join("\n")}\n\n## Constraints\nRead-only; no file changes.\n\n## Evidence\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`\n\n## Open questions\nNone.`;
	}
	if (id.startsWith("researcher-") && answer.claims) {
		const display = (item: unknown) => item === null ? "unknown" : Array.isArray(item) ? item.join(", ") : String(item);
		const unknown = answer.claims.filter((claim) => claim.value === null).map((claim) => claim.id);
		const sources = [...new Set(answer.claims.flatMap((claim) => claim.citations.map((citation) => citation.url)))];
		return `# Research: ${id}\n\n## Answer\n${answer.claims.map((claim) => `${claim.id}: ${display(claim.value)}.`).join(" ")}\n\n## Findings\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\`\n\n## Gaps\n${unknown.length ? `Unknown: ${unknown.join(", ")}.` : "None."}\n\n## Sources\n${sources.map((url) => `- ${url}`).join("\n")}`;
	}
	return JSON.stringify(value);
}

async function runCase(id: string, output: unknown, extra: Parameters<ReturnType<typeof createMockPi>["onCall"]>[0] = {}, options: { timeoutMs?: number; cli?: boolean; rawOutput?: string } = {}) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-support-"));
	roots.push(root);
	const mock = createMockPi();
	mocks.push(mock);
	mock.install();
	mock.onCall({
		sessionEntries: [
			{ type: "model_change", provider: "fixture", modelId: "offline" },
			{ type: "thinking_level_change", thinkingLevel: "low" },
		],
		jsonl: [{ type: "message_end", message: {
			role: "assistant", model: "fixture/offline", api: "openai-responses", stopReason: "stop",
			content: [{ type: "text", text: options.rawOutput ?? referenceHandoff(id, output) }],
			usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage: {
				input_tokens: 100, output_tokens: 20, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 }, total_tokens: 120,
			} },
			usage: { cost: { total: 0.001 } },
		} }],
		...extra,
	});
	const caseDir = path.join(corpus, id);
	const definition = JSON.parse(fs.readFileSync(path.join(caseDir, "case.json"), "utf8"));
	definition.fixture = path.resolve(caseDir, definition.fixture);
	definition.evaluator.args = definition.evaluator.args.map((arg: string) => arg.replaceAll("{caseDir}", caseDir));
	definition.route = { modelTier: "Offline fixture", model: "fixture/offline", thinkingLevel: "low" };
	definition.currentPricing = { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-09-07", source: "https://example.invalid/synthetic-test-rates", input: 1, output: 2, cacheRead: 0.5, cacheWrite: 3 };
	if (options.timeoutMs !== undefined) definition.timeoutMs = options.timeoutMs;
	const casePath = path.join(root, "case.json");
	const outputDir = path.join(root, "run");
	fs.writeFileSync(casePath, JSON.stringify(definition));
	let result;
	if (options.cli) {
		const child = spawnSync(process.execPath, [path.join(corpus, "../../benchmark-runner.mjs"), casePath, "--output", outputDir], { encoding: "utf8", timeout: 30000 });
		assert.equal(child.status, 0, child.stderr || child.stdout);
		result = { passed: true, resultPath: path.join(outputDir, "result.json"), receiptPath: path.join(outputDir, "receipt.json") };
	} else result = await runBenchmarkCase({ casePath, outputDir });
	const receipt = JSON.parse(fs.readFileSync(result.receiptPath, "utf8"));
	assert.ok(Object.keys(receipt.workspace.before).every((name) => !/evaluator|expectations|case\.json|\.git/.test(name)), "Only candidate fixture material may enter workspace");
	assert.doesNotMatch(receipt.invocation.args.join("\n"), /expectations\.json|evaluator\.mjs|delegate-checks\.mjs/);
	return { result, normalized: JSON.parse(fs.readFileSync(result.resultPath, "utf8")), receipt };
}

describe("support Agent role corpus", () => {
	it("indexes exactly three cases per role and preserves the pinned historical bytes", () => {
		const manifest = JSON.parse(fs.readFileSync(path.join(corpus, "corpus.json"), "utf8"));
		const cases: Array<{ role: string; stage: string; case: string; origin: string }> = manifest.cases;
		assert.equal(cases.length, 9);
		assert.equal(new Set(cases.map((entry) => entry.case)).size, 9);
		for (const role of ["scout", "delegate", "researcher"]) {
			assert.equal(cases.filter((entry) => entry.role === role && entry.stage === "screening" && entry.origin === "public-history").length, 1);
			assert.equal(cases.filter((entry) => entry.role === role && entry.stage === "finalist" && entry.origin === "synthetic").length, 2);
		}
		for (const entry of cases) {
			const definition = parseBenchmarkCase(JSON.parse(fs.readFileSync(path.join(corpus, entry.case), "utf8")));
			assert.equal(definition.agentRole, entry.role);
			assert.equal(definition.evaluator.kind, "command");
			assert.equal(definition.currentPricing, undefined, "Corpus must not embed pretend live prices");
			assert.equal(definition.route.model, "unconfigured/support-corpus");
		}
		const sources = JSON.parse(fs.readFileSync(path.join(corpus, "fixtures/rename/SOURCES.json"), "utf8"));
		assert.equal(sources.revision, "7be3d34396336ed4e23eb5f88cae59ddc01c97f9");
		for (const file of sources.files) {
			assert.equal(createHash("sha256").update(fs.readFileSync(path.join(corpus, "fixtures/rename", file.path))).digest("hex"), file.sha256);
		}
	});
	it("scores historical scout discovery with bounded source-backed evidence", async () => {
		const { result, normalized, receipt } = await runCase("scout-rename", historicalDiscovery);
		assert.equal(result.passed, true, normalized.evaluation.evidence);
		assert.equal(JSON.parse(normalized.evaluation.evidence).score, 1);
		assert.equal(normalized.metrics.peakContextLoad, 120);
		assert.equal(normalized.benchmarkCost.amount, 0.000135);
		assert.ok(Number.isFinite(Date.parse(receipt.candidate.endedAt) - Date.parse(receipt.candidate.startedAt)));
		assert.equal(receipt.session.fresh, true);
		assert.ok(Object.keys(receipt.workspace.before).every((name) => !/evaluator|expectation|case\.json|\.git/.test(name)));
	});

	it("scores primary-source research and rejects unsupported claims and secondary-source citations", async () => {
		const citation = { path: "src/shared/atomic-json.ts", url: "https://github.com/elBenz/pi-ensemble/blob/7be3d34396336ed4e23eb5f88cae59ddc01c97f9/src/shared/atomic-json.ts" };
		const claims = [
			{ id: "retry-codes", value: ["EACCES", "EBUSY", "EPERM"], citations: [{ ...citation, quote: 'const RETRYABLE_RENAME_ERROR_CODES = new Set(["EACCES", "EBUSY", "EPERM"]);' }] },
			{ id: "default-platform", value: "win32", citations: [{ ...citation, quote: 'const retryRenameErrors = options.retryRenameErrors ?? process.platform === "win32";' }] },
		];
		const good = await runCase("researcher-rename", { claims });
		assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
		const unsupported = await runCase("researcher-rename", { claims: [...claims, { id: "guaranteed-success", value: true, citations: [] }] });
		assert.equal(unsupported.result.passed, false);
		assert.equal(JSON.parse(unsupported.normalized.evaluation.evidence).checks.noUnsupportedClaims, false);
		const secondary = await runCase("researcher-rename", { claims: claims.map((claim) => ({ ...claim, citations: claim.citations.map((source) => ({ ...source, url: "https://example.invalid/blog" })) })) });
		assert.equal(secondary.result.passed, false);
		assert.equal(JSON.parse(secondary.normalized.evaluation.evidence).checks.sourceScope, false);
	});

	it("checks narrow delegate mutation and behavioral regressions, not a claimed success", async () => {
		const target = "src/shared/atomic-json.ts";
		const source = fs.readFileSync(path.join(corpus, "fixtures/rename", target), "utf8");
		const fixed = source.replace("[10, 25, 50, 100, 200]", "[10, 25, 50, 100, 200, 500, 1000, 2000, 4000]");
		const answer = { changedFiles: [target], result: "updated" };
		const good = await runCase("delegate-rename", answer, { writeFiles: [{ path: target, content: fixed }] });
		assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
		const noop = await runCase("delegate-rename", answer);
		assert.equal(noop.result.passed, false);
		assert.equal(noop.normalized.mutation.passed, false);
		assert.equal(JSON.parse(noop.normalized.evaluation.evidence).checks.regressions, false);
		const withoutWrite = fixed.replace('fsImpl.writeFileSync(tempPath, JSON.stringify(payload, null, 2), "utf-8");', "");
		const broken = await runCase("delegate-rename", answer, { writeFiles: [{ path: target, content: withoutWrite }] });
		assert.equal(broken.result.passed, false, "A retry loop that never writes data must fail");
		const wrongDefault = fixed.replace('options.retryRenameErrors ?? process.platform === "win32"', 'options.retryRenameErrors ?? process.platform !== "win32"');
		assert.equal((await runCase("delegate-rename", answer, { writeFiles: [{ path: target, content: wrongDefault }] })).result.passed, false);
		const expansion = await runCase("delegate-rename", answer, { writeFiles: [{ path: target, content: fixed }, { path: "unrelated.txt", content: "extra" }] });
		assert.equal(expansion.result.passed, false);
		assert.equal(JSON.parse(expansion.normalized.evaluation.evidence).checks.isolation, false);
	});

	it("runs both synthetic scout cases, rejecting decoys, bad evidence and forbidden mutation", async () => {
		const dispatch = { discoveries: [
			{ path: "src/routes.mjs", symbol: "routes", quote: 'export const routes = { inspect: inspectJob };' },
			{ path: "src/inspect.mjs", symbol: "inspectJob", quote: 'export function inspectJob(job) { return job.state; }' },
		] };
		assert.equal((await runCase("scout-dispatch", dispatch, {}, { cli: true })).result.passed, true);
		const boundary = { discoveries: [{ path: "src/current/config.mjs", symbol: "resolveConfig", quote: 'return local ?? shared ?? "default";' }] };
		assert.equal((await runCase("scout-boundary", boundary)).result.passed, true);
		for (const answer of [
			{ discoveries: [...boundary.discoveries, { path: "src/legacy/config.mjs", symbol: "resolveConfig", quote: "legacy" }] },
			{ discoveries: [{ ...boundary.discoveries[0], quote: "invented evidence" }] },
			{ discoveries: [] },
			{ discoveries: [{ ...boundary.discoveries[0], startLine: 99, endLine: 99 }] },
		]) assert.equal((await runCase("scout-boundary", answer)).result.passed, false);
		const mutated = await runCase("scout-boundary", boundary, { writeFiles: [{ path: "notes.txt", content: "not allowed" }] });
		assert.equal(mutated.normalized.mutation.passed, false);
		assert.equal(mutated.result.passed, false);
		assert.equal((await runCase("scout-boundary", boundary, {}, { rawOutput: JSON.stringify(boundary) })).result.passed, false, "JSON alone does not meet scout handoff contract");
	});

	it("runs research version and unknown-data edges through the shared seam", async () => {
		const version = { claims: [
			{ id: "retry-limit", value: 4, citations: [{ path: "sources/v2.md", url: "https://primary.example.invalid/widget/v2", quote: "Version 2 permits at most 4 retries." }] },
			{ id: "retry-method", value: "GET", citations: [{ path: "sources/v2.md", url: "https://primary.example.invalid/widget/v2", quote: "Only GET is retryable." }] },
		] };
		assert.equal((await runCase("researcher-version", version)).result.passed, true);
		const wrong = structuredClone(version);
		wrong.claims[0]!.value = 8;
		assert.equal((await runCase("researcher-version", wrong)).result.passed, false);
		const unknown = { claims: [
			{ id: "peak-context", value: null, citations: [{ path: "sources/report.md", url: "https://primary.example.invalid/report/1", quote: "Median peak context was not measured." }] },
			{ id: "cost-basis", value: "historical", citations: [{ path: "sources/report.md", url: "https://primary.example.invalid/report/1", quote: "Costs reflect historical recorded charges, not current prices." }] },
		] };
		assert.equal((await runCase("researcher-unknown", unknown)).result.passed, true);
		const invented = structuredClone(unknown);
		invented.claims[0]!.value = "0";
		assert.equal((await runCase("researcher-unknown", invented)).result.passed, false);
	});

	it("checks delegate malformed-input regressions and isolated read-only extraction", async () => {
		const answer = { changedFiles: ["tags.mjs"], result: "updated" };
		const fixed = 'export function normalizeTags(values) { if (!Array.isArray(values) || values.some(v => typeof v !== "string")) throw new TypeError("tags"); return [...new Set(values.map(v => v.trim().toLowerCase()).filter(Boolean))]; }\n';
		assert.equal((await runCase("delegate-tags", answer, { writeFiles: [{ path: "tags.mjs", content: fixed }] })).result.passed, true);
		const regression = fixed.replace('values.some(v => typeof v !== "string")', "false").replace("v.trim()", "String(v).trim()");
		assert.equal((await runCase("delegate-tags", answer, { writeFiles: [{ path: "tags.mjs", content: regression }] })).result.passed, false);
		const extracted = { changedFiles: [], result: { runId: "r2", artifact: "out/b.json" } };
		assert.equal((await runCase("delegate-extract", extracted)).result.passed, true);
		assert.equal((await runCase("delegate-extract", { ...extracted, commentary: "extra parent context" })).result.passed, false);
		assert.equal((await runCase("delegate-extract", { changedFiles: [], result: { runId: "r3", artifact: "out/c.json" } })).result.passed, false);
	});

	it("accepts wrapped research Answer prose without accepting extra claims", async () => {
		const answer = { claims: [
			{ id: "retry-limit", value: 4, citations: [{ path: "sources/v2.md", url: "https://primary.example.invalid/widget/v2", quote: "Version 2 permits at most 4 retries." }] },
			{ id: "retry-method", value: "GET", citations: [{ path: "sources/v2.md", url: "https://primary.example.invalid/widget/v2", quote: "Only GET is retryable." }] },
		] };
		const wrapped = referenceHandoff("researcher-version", answer).replace("retry-limit: 4. retry-method: GET.", "retry-limit: 4.\nretry-method: GET.");
		const good = await runCase("researcher-version", answer, {}, { rawOutput: wrapped });
		assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
		const invented = wrapped.replace("retry-method: GET.\n", "retry-method: GET.\nPOST is also safe.\n");
		assert.equal((await runCase("researcher-version", answer, {}, { rawOutput: invented })).result.passed, false);
	});

	it("retains failed timeout execution rather than crediting role output", async () => {
		const timed = await runCase("scout-rename", historicalDiscovery, { delay: 2000 }, { timeoutMs: 100 });
		assert.equal(timed.result.passed, false);
		assert.equal(timed.normalized.execution.timedOut, true);
	});
});
