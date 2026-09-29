import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, it } from "node:test";
import { gunzipSync, gzipSync } from "node:zlib";
import { prepare, ledger, schedule, executeOffline, runtimeDigest, validateGates, auditPrior, taskIds } from "../../benchmarks/luna-worker-validation/campaign.mjs";
import { receiptAccounting } from "../../benchmarks/gpt6-comparison/accounting.mjs";
import { parseBenchmarkCase, runBenchmarkCase } from "../../src/benchmark/runner.ts";
import { createMockPi } from "../support/mock-pi.ts";
import { calculateBenchmarkCost } from "../../src/benchmark/policy.ts";
const roots: string[] = [];
afterEach(() => { for (const p of roots.splice(0)) fs.rmSync(p, { recursive: true, force: true }); });
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v));
const sha = p => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
function setup() {
 const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "gpt6-campaign-"))); roots.push(root);
 const drafts = path.join(root, "drafts"), out = path.join(root, "out"), agentDir = path.join(root, "agent");
 fs.mkdirSync(drafts);
 for (const id of taskIds) {
  const dir = path.join(drafts, "cases", id); fs.mkdirSync(path.join(dir, "fixture"), { recursive: true });
  fs.writeFileSync(path.join(dir, "fixture", "input.txt"), "fixture");
  write(path.join(dir, "case.json"), { id, agentRole: "worker", fixture: "fixture", prompt: "Implement task", evaluator: { kind: "output-includes", expected: "OK" }, mutationPolicy: "allow", timeoutMs: 90000 });
 }
 write(path.join(drafts, "corpus.json"), { schemaVersion: 1, cases: taskIds.map(id => ({ id, case: `cases/${id}/case.json`, kind: "implementation" })) });
 fs.mkdirSync(agentDir); fs.mkdirSync(path.join(root, "runtime"));
 const binary = path.join(root, "runtime/cli.js"); fs.writeFileSync(binary, "// mock, never executed");
 const matrix = read("benchmarks/gpt6-comparison/matrix.json");
 write(path.join(agentDir, "settings.json"), { transport: "sse", enableInstallTelemetry: false, enableAnalytics: false, compaction: { enabled: false }, retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } }, packages: [], extensions: [], skills: [], prompts: [], themes: [], enableSkillCommands: false, defaultProjectTrust: "never" });
 write(path.join(agentDir, "models.json"), { providers: { "openai-codex": { models: Object.values(matrix.models).map(m => ({ id: m.route.model.split("/")[1], api: "openai-codex-responses", reasoning: true, contextWindow: 272000, thinkingLevelMap: { medium: "medium", high: "high" }, cost: m.pricingReference })) } } });
 write(path.join(agentDir, "models-store.json"), {});
 const listing = path.join(root, "listing.txt"); fs.writeFileSync(listing, Object.values(matrix.models).map(m => m.route.model.replace("/", " ")).join("\n"));
 const gates = { schemaVersion: 1, transport: "sse", usageProvenance: true, runtime: { binary, sha256: runtimeDigest(binary) }, agentDir, settingsSha256: sha(path.join(agentDir, "settings.json")), modelsSha256: sha(path.join(agentDir, "models.json")), modelsStoreSha256: sha(path.join(agentDir, "models-store.json")), catalogListing: { path: listing, sha256: sha(listing) }, checks: Object.values(matrix.models).map(m => ({ query: `${m.route.model}:medium`, resolved: `${m.route.model}:medium`, effortSupported: true })), pricingVerifiedAt: "2026-09-28", pricing: Object.fromEntries(Object.entries(matrix.models).map(([k, m]) => [k, m.pricingReference])) };
 gates.checks.push({ query: "openai-codex/gpt-6-luna:high", resolved: "openai-codex/gpt-6-luna:high", effortSupported: true });
 const archive = JSON.parse(gunzipSync(fs.readFileSync("docs/research/gpt6-screening-20260928/artifacts.json.gz")));
 const manifest = JSON.parse(archive.files["manifest.json"]); manifest.gates = gates;
 for (const name of ["settings.json", "models.json", "models-store.json"]) archive.publicInputs[path.join(agentDir, name)] = fs.readFileSync(path.join(agentDir, name), "utf8");
 archive.files["manifest.json"] = JSON.stringify(manifest);
 archive.files["manifest-seal.json"] = JSON.stringify({ sha256: createHash("sha256").update(archive.files["manifest.json"]).digest("hex") });
 const archivePath = path.join(root, "archive.gz"); fs.writeFileSync(archivePath, gzipSync(JSON.stringify(archive)));
 const ledgerPath = path.resolve("docs/research/gpt6-screening-20260928/ledger.json");
 const approvalPath = path.join(root, "approval.json"); write(approvalPath, { archive: { path: archivePath, sha256: sha(archivePath) }, ledger: { path: ledgerPath, sha256: sha(ledgerPath) } });
 const gatesPath = path.join(root, "gates.json"); write(gatesPath, gates);
 prepare(out, drafts, gatesPath, approvalPath);
 return { root, out, drafts, gates, gatesPath, agentDir, approvalPath };
}
function synthetic(casePath, outputDir, outputTokens = 10) {
 const c = parseBenchmarkCase(JSON.parse(fs.readFileSync(casePath, "utf8")));
 const turns = []; let amount = 0;
 const processFor = (spec, action = { action: "finish" }) => {
  const resolved = { ...spec.route, complete: true };
  const usage = { input: 10, output: outputTokens, cacheRead: 0, cacheWrite: 0 };
  turns.push({ turn: turns.length + 1, contextLoad: 10 + outputTokens, ...usage });
  amount += calculateBenchmarkCost(usage, spec.currentPricing).amount;
  const message = { role: "assistant", provider: spec.route.model.split("/")[0], model: spec.route.model.split("/")[1], api: "openai-codex-responses", stopReason: "stop", content: [{ type: "text", text: JSON.stringify(action) }], usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage: { input_tokens: 10, output_tokens: outputTokens, total_tokens: 10 + outputTokens, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } };
  return { resolved, process: { stdout: JSON.stringify({ type: "message_end", message }) + "\n", exitCode: 0, timedOut: false, startedAt: "2026-09-28T00:00:00Z", endedAt: "2026-09-28T00:00:01Z" } };
 };
 const resolved = { ...c.route, complete: true };
 let receipt;
 if (c.workflow) {
  const parents = [], children = [];
  for (const child of c.workflow.children.filter(child => ["worker", "reviewer"].includes(child.role))) {
   parents.push(processFor(c, { action: "delegate", role: child.role }));
   children.push({ ...processFor(child), role: child.role, session: `child-${children.length + 1}/session.jsonl` });
  }
  parents.push(processFor(c));
  receipt = { case: c, resolved, candidate: { stdout: parents.map(p => p.process.stdout).join("\n") }, workflow: { parents, children } };
 } else receipt = { case: c, resolved, candidate: processFor(c).process };
 const result = { passed: true, benchmarkCost: { amount }, telemetry: { passed: true }, resolved, metrics: { perTurn: turns } };
 fs.mkdirSync(outputDir);
 fs.writeFileSync(path.join(outputDir, "receipt.json"), JSON.stringify(receipt));
 fs.writeFileSync(path.join(outputDir, "result.json"), JSON.stringify(result));
 return { receipt, result };
}

it("audits real archived raw evidence and carries charge into balanced 54-worker schedule", async () => {
 const { out, approvalPath } = setup();
 assert.equal(auditPrior(read(approvalPath)).budgetCharge, 1.661103);
 assert.equal(ledger(out).remainingBudget, 23.338897);
 assert.equal(schedule().length, 54);
 for (const task of taskIds) for (const arm of ["Luna-medium", "Luna-high", "Sol-medium"]) assert.equal(schedule().filter(e => e.group === task && e.arm === arm).length, 3);
 let calls = 0;
 const runner = async ({casePath, outputDir}) => { calls++; synthetic(casePath, outputDir); };
 await assert.rejects(executeOffline(out, "run", { runner }), /high probe/);
 await executeOffline(out, "probe", { runner });
 const result = await executeOffline(out, "run", { runner });
 assert.equal(calls, 55); assert.equal(result.remaining.length, 0);
 assert.equal(result.groups["overall/Luna-high"].attempts, 18);
 assert.ok(result.groups["overall/Luna-high"].medianWallTimeMs >= 0);
 await executeOffline(out, "run", { runner }); assert.equal(calls, 55);
});
it("requires exact high effort evidence and rejects raw archive corruption", () => {
 const { gates, approvalPath } = setup();
 gates.checks.pop(); assert.throws(() => validateGates(gates), /high effort/);
 const approval = read(approvalPath); const a = JSON.parse(gunzipSync(fs.readFileSync(approval.archive.path)));
 a.files["probe-luna/run/receipt.json"] += " "; fs.writeFileSync(approval.archive.path, gzipSync(JSON.stringify(a))); approval.archive.sha256 = sha(approval.archive.path);
 assert.throws(() => auditPrior(approval), /digest/);
});
it("unknown or thrown launches stop permanently, retain markers and observed failure time", async () => {
 const { out } = setup(); let calls = 0;
 const runner = async () => { calls++; throw new Error("transport disconnected"); };
 await assert.rejects(executeOffline(out, "probe", { runner }), /never retry/);
 const l = ledger(out); assert.equal(l.blocked, true); assert.equal(l.measuredTotal, null);
 assert.ok(read(path.join(out, "probe-Luna-high/failure.json")).wallTimeMs >= 0);
 await assert.rejects(executeOffline(out, "probe", { runner }), /Incomplete/); assert.equal(calls, 1);
});
it("failed probes retain complete charge but prevent later probes and screening", async () => {
 const { out } = setup(); let calls = 0;
 await assert.rejects(executeOffline(out, "probe", { runner: async ({ casePath, outputDir }) => {
  calls++; const { result } = synthetic(casePath, outputDir); result.passed = false; write(path.join(outputDir, "result.json"), result);
 } }), /Failed runtime probe/);
 const l = ledger(out); assert.ok(l.knownSpend > 0); assert.equal(calls, 1); assert.equal(l.blocked, true);
});
it("retains screening acceptance failures and distinguishes transport failures without free retries", async () => {
 const { out } = setup(); const runner = async ({ casePath, outputDir }) => { synthetic(casePath, outputDir); };
 await executeOffline(out, "probe", { runner });
 const l = await executeOffline(out, "run", { runner: async ({ casePath, outputDir }) => {
  const { receipt, result } = synthetic(casePath, outputDir);
  result.passed = false;
  if (!receipt.workflow) receipt.candidate.exitCode = 1;
  write(path.join(outputDir, "receipt.json"), receipt); write(path.join(outputDir, "result.json"), result);
 } });
 assert.equal(l.entries.length, 55);
 for (const [key, g] of Object.entries(l.groups)) { assert.equal(g.acceptanceRate, 0); assert.equal(g.costPerAccepted, null); assert.ok(g.totalCost > 0); assert.equal(g.transportFailures, key.startsWith("overall") ? 18 : 3); }
});
it("rejects source/case/runtime/catalog/overlay/pricing/config drift offline", () => {
 const { out, gates, agentDir } = setup();
 const altered = structuredClone(gates); altered.pricing.sol.input = 9; assert.throws(() => validateGates(altered), /Pricing/);
 const effort = structuredClone(gates); effort.checks[0].resolved = "openai-codex/gpt-6-astra:high"; assert.throws(() => validateGates(effort), /effort/);
 fs.appendFileSync(path.join(agentDir, "models.json"), " "); assert.throws(() => ledger(out), /configuration/);
 fs.writeFileSync(path.join(agentDir, "models.json"), fs.readFileSync(path.join(agentDir, "models.json"), "utf8").trimEnd());
 const casePath = path.join(out, "cases/probe-Luna-high.json"); fs.chmodSync(casePath, 0o644); fs.appendFileSync(casePath, " "); assert.throws(() => ledger(out), /Frozen case/);
});
it("warning and hard stop charge probes, including full in-flight cost", async () => {
 const { out } = setup(); const warnings = []; let calls = 0;
 await assert.rejects(executeOffline(out, "probe", { onWarning: s => warnings.push(s), runner: async ({ casePath, outputDir }) => {
  calls++; synthetic(casePath, outputDir, 50000000);
 } }), /\$25/);
 const l = ledger(out); assert.equal(calls, 1); assert.ok(l.knownSpend > 25); assert.ok(warnings.some(s => s.includes("$15"))); assert.equal(l.blocked, true);
});
it("locks concurrency and detects sealed receipt/manifest tampering", async () => {
 const { out } = setup();
 await executeOffline(out, "probe", { runner: async ({ casePath, outputDir }) => {
  await assert.rejects(executeOffline(out, "probe", { runner: async () => assert.fail("concurrent launch") }), /Execution active|Incomplete launch/);
  synthetic(casePath, outputDir);
 } });
 const p = path.join(out, "probe-Luna-high/run/receipt.json"); fs.appendFileSync(p, " "); assert.throws(() => ledger(out), /artifact changed/);
});
it("unknown raw usage blocks next launch and keeps complete failed attempt", async () => {
 const { out } = setup(); const runner = async ({ casePath, outputDir }) => { synthetic(casePath, outputDir); };
 await executeOffline(out, "probe", { runner }); let calls = 0;
 await assert.rejects(executeOffline(out, "run", { runner: async ({ casePath, outputDir }) => {
  calls++; const { receipt } = synthetic(casePath, outputDir);
  const event = JSON.parse(receipt.candidate.stdout); delete event.message.usageProvenance;
  receipt.candidate.stdout = JSON.stringify(event); write(path.join(outputDir, "receipt.json"), receipt);
 } }), /Unknown accounting/);
 assert.equal(calls, 1); const l = ledger(out); assert.equal(l.measuredTotal, null); assert.equal(l.blocked, true);
 assert.equal(l.groups["deadline-preservation/Luna-medium"].totalCost, null);
 assert.equal(l.groups["deadline-preservation/Luna-medium"].tailBreaches, null);
 assert.equal(l.remainingBudget, null);
});
it("preflight cannot race changed inputs into a launch; gates fail before launch marker", async () => {
 const { out, gates } = setup(); let calls = 0;
 await assert.rejects(executeOffline(out, "probe", {
  preflight: () => fs.appendFileSync(gates.runtime.binary, "changed"),
  runner: async () => { calls++; },
 }), /Runtime|Frozen source/);
 assert.equal(calls, 0); assert.equal(fs.readdirSync(path.join(out, "launches")).length, 0);
});
it("fixture additions and empty directories block before a model launch", async () => {
 const { out } = setup();
 const fixture = read(path.join(out, "cases/deadline-preservation--Luna-medium.json")).fixture;
 const added = path.join(fixture, "AGENTS.md");
 fs.writeFileSync(added, "unexpected instructions");
 let calls = 0;
 await assert.rejects(executeOffline(out, "probe", { runner: async () => { calls++; } }), /inventory changed/);
 assert.equal(calls, 0);
 fs.unlinkSync(added); fs.mkdirSync(path.join(fixture, ".pi"));
 assert.throws(() => ledger(out), /inventory changed/);
});
it("warning includes inherited spend; stale locks and prior config drift block", async () => {
 const { out, gatesPath, approvalPath, drafts, root } = setup(); const warnings = [];
 const l = await executeOffline(out, "probe", { onWarning: x => warnings.push(x), runner: async ({casePath, outputDir}) => { synthetic(casePath, outputDir, 26800000); } });
 assert.ok(l.newSpend < 15); assert.ok(l.budgetCharge > 15); assert.ok(warnings.length);
 fs.writeFileSync(path.join(out, ".execution-lock"), "{}");
 await assert.rejects(executeOffline(out, "run", { runner: async () => assert.fail("stale lock launch") }), /Execution active/);
 const gates = read(gatesPath); gates.pricingVerifiedAt = "2026-09-29";
 gates.runtime = { ...gates.runtime, binary: gates.runtime.binary };
 // Approved archive cannot be silently replaced or spend initialized manually.
 const approval = read(approvalPath); approval.archive.sha256 = "0".repeat(64); write(approvalPath, approval);
 assert.throws(() => prepare(path.join(root, "second"), drafts, gatesPath, approvalPath), /provenance/);
});
it("raw high effort accounting rejects medium resolution and fabricated totals", () => {
 const { out, root } = setup();
 const { receipt, result } = synthetic(path.join(out, "cases/probe-Luna-high.json"), path.join(root, "raw-high"));
 assert.ok(receiptAccounting(receipt, result).amount > 0);
 const wrong = structuredClone(receipt); wrong.resolved.thinkingLevel = "medium";
 assert.throws(() => receiptAccounting(wrong, result), /Route/);
 result.benchmarkCost.amount += 1;
 assert.throws(() => receiptAccounting(receipt, result), /accounting/);
});
