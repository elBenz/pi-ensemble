import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, it } from "node:test";
import { prepareComparison } from "../../benchmarks/gpt6-comparison/prepare.mjs";
import { prepare, ledger, schedule, executeOffline, runtimeDigest, validateGates } from "../../benchmarks/gpt6-comparison/campaign.mjs";
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
 prepareComparison(drafts);
 // Copies let drift regressions mutate fixtures without touching corpus originals.
 const draftManifest = read(path.join(drafts, "manifest.json"));
 for (const entry of draftManifest.cases) {
  const draftPath = path.join(drafts, entry.file), c = read(draftPath);
  const fixture = path.join(root, "fixtures", entry.id.split("--")[0]);
  if (!fs.existsSync(fixture)) {
   fs.cpSync(path.resolve(path.dirname(draftPath), c.fixture), fixture, { recursive: true });
   for (const file of fs.readdirSync(fixture, { recursive: true })) {
    const p = path.join(fixture, file);
    if (fs.statSync(p).isFile()) draftManifest.sources.push({ path: path.relative(drafts, p), sha256: sha(p) });
   }
  }
  c.fixture = fixture; write(draftPath, c); entry.sha256 = sha(draftPath);
 }
 write(path.join(drafts, "manifest.json"), draftManifest);
 fs.mkdirSync(agentDir); fs.mkdirSync(path.join(root, "runtime"));
 const binary = path.join(root, "runtime/cli.js"); fs.writeFileSync(binary, "// mock, never executed");
 const matrix = read("benchmarks/gpt6-comparison/matrix.json");
 write(path.join(agentDir, "settings.json"), { transport: "sse", enableInstallTelemetry: false, enableAnalytics: false, compaction: { enabled: false }, retry: { enabled: false, maxRetries: 0, provider: { maxRetries: 0 } }, packages: [], extensions: [], skills: [], prompts: [], themes: [], enableSkillCommands: false, defaultProjectTrust: "never" });
 write(path.join(agentDir, "models.json"), { providers: { "openai-codex": { models: Object.values(matrix.models).map(m => ({ id: m.route.model.split("/")[1], api: "openai-codex-responses", reasoning: true, contextWindow: 272000, thinkingLevelMap: { medium: "medium" }, cost: m.pricingReference })) } } });
 write(path.join(agentDir, "models-store.json"), {});
 const listing = path.join(root, "listing.txt"); fs.writeFileSync(listing, Object.values(matrix.models).map(m => m.route.model.replace("/", " ")).join("\n"));
 const gates = { schemaVersion: 1, transport: "sse", usageProvenance: true, runtime: { binary, sha256: runtimeDigest(binary) }, agentDir, settingsSha256: sha(path.join(agentDir, "settings.json")), modelsSha256: sha(path.join(agentDir, "models.json")), modelsStoreSha256: sha(path.join(agentDir, "models-store.json")), catalogListing: { path: listing, sha256: sha(listing) }, checks: Object.values(matrix.models).map(m => ({ query: `${m.route.model}:medium`, resolved: `${m.route.model}:medium`, effortSupported: true })), pricingVerifiedAt: "2026-09-28", pricing: Object.fromEntries(Object.entries(matrix.models).map(([k, m]) => [k, m.pricingReference])) };
 const gatesPath = path.join(root, "gates.json"); write(gatesPath, gates);
 prepare(out, drafts, gatesPath);
 return { root, out, drafts, gates, gatesPath, agentDir };
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
it("promotes only screening, balances workflow arms, separates historical accounting", () => {
 const { out, drafts, gatesPath } = setup();
 const m = read(path.join(out, "manifest.json")), l = ledger(out);
 assert.equal(m.entries.length, 21); assert.equal(Object.keys(m.caseHashes).length, 9);
 assert.equal(l.knownSpend, 0); assert.equal(l.remainingBudget, 25); assert.equal(l.historicalAccounting.measuredTotal, null);
 assert.equal(l.historicalAccounting.budgetCharge, 18.129328);
 assert.throws(() => prepare(out, drafts, gatesPath), /exists/);
 for (const group of ["worker-component", "orchestrated"]) for (const arm of ["astra-worker", "sol-worker", "luna-worker"]) {
  const entries = schedule().filter(e => e.group === group && e.arm === arm);
  assert.equal(entries.length, 3);
  const positions = schedule().filter(e => e.group === group).map((e, i) => e.arm === arm ? i % 3 : -1).filter(i => i >= 0);
  assert.equal(new Set(positions).size, 3);
 }
 for (const key of Object.keys(m.caseHashes)) {
  const c = read(path.join(out, key)); assert.equal(c.route.thinkingLevel, "medium"); assert.equal(c.candidateRoute, undefined);
  if (c.workflow) {
   assert.equal(c.route.model, "openai-codex/gpt-6-astra");
   assert.equal(c.workflow.children.find(c => c.role === "reviewer").route.model, "openai-codex/gpt-6-astra");
  }
 }
 assert.ok(Object.keys(m.frozen).some(p => p.endsWith("src/benchmark/runner.ts")));
 assert.ok(Object.keys(m.frozen).some(p => p.endsWith("agents/worker.md")));
 assert.ok(Object.keys(m.frozen).some(p => p.endsWith("accounting.mjs")));
});
it("charges three probes and 18 sequential attempts once; groups child-route variants independently", async () => {
 const { out } = setup(); const calls = []; let previousBudget = 26;
 const runner = async ({ casePath, outputDir, launchBudgetUsd, env }) => {
  assert.ok(launchBudgetUsd < previousBudget); previousBudget = launchBudgetUsd;
  assert.equal(env.PI_OFFLINE, "1"); assert.equal(env.OPENAI_API_KEY, undefined);
  assert.equal(fs.existsSync(outputDir), false);
  calls.push(path.basename(path.dirname(outputDir))); synthetic(casePath, outputDir);
 };
 await assert.rejects(executeOffline(out, "run", { runner }), /Three successful/);
 const probes = await executeOffline(out, "probe", { runner }); assert.equal(probes.entries.length, 3); assert.ok(probes.knownSpend > 0);
 const l = await executeOffline(out, "run", { runner }); assert.equal(calls.length, 21); assert.equal(l.remaining.length, 0);
 assert.equal(Object.keys(l.groups).length, 6);
 for (const g of Object.values(l.groups)) { assert.equal(g.attempts, 3); assert.equal(g.acceptanceRate, 1); assert.equal(g.costPerAccepted, g.totalCost / 3); assert.ok(g.wallTimeMs >= 0); }
 assert.equal(l.entries.find(e => e.group === "orchestrated").accounting.components.length, 5);
 assert.equal(l.entries[0].accounting.components[0].durationMs, 1000);
 await executeOffline(out, "run", { runner }); assert.equal(calls.length, 21);
});
it("unknown or thrown launches stop permanently, retain markers and observed failure time", async () => {
 const { out } = setup(); let calls = 0;
 const runner = async () => { calls++; throw new Error("transport disconnected"); };
 await assert.rejects(executeOffline(out, "probe", { runner }), /never retry/);
 const l = ledger(out); assert.equal(l.blocked, true); assert.equal(l.measuredTotal, null);
 assert.ok(read(path.join(out, "probe-astra/failure.json")).wallTimeMs >= 0);
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
 assert.equal(l.entries.length, 21);
 for (const [key, g] of Object.entries(l.groups)) { assert.equal(g.acceptanceRate, 0); assert.equal(g.costPerAccepted, null); assert.ok(g.totalCost > 0); assert.equal(g.transportFailures, key.startsWith("worker-component") ? 3 : 0); }
});
it("rejects source/case/runtime/catalog/overlay/pricing/config drift offline", () => {
 const { out, gates, agentDir } = setup();
 const altered = structuredClone(gates); altered.pricing.sol.input = 9; assert.throws(() => validateGates(altered), /Pricing/);
 const effort = structuredClone(gates); effort.checks[0].resolved = "openai-codex/gpt-6-astra:high"; assert.throws(() => validateGates(effort), /effort/);
 fs.appendFileSync(path.join(agentDir, "models.json"), " "); assert.throws(() => ledger(out), /configuration/);
 fs.writeFileSync(path.join(agentDir, "models.json"), fs.readFileSync(path.join(agentDir, "models.json"), "utf8").trimEnd());
 const casePath = path.join(out, "cases/probe-astra.json"); fs.chmodSync(casePath, 0o644); fs.appendFileSync(casePath, " "); assert.throws(() => ledger(out), /Frozen case/);
});
it("raw accounting rejects missing child cost, long context, wrong route, unfinished/error usage", () => {
 const { out, root } = setup();
 const { receipt, result } = synthetic(path.join(out, "cases/parent-deadline--sol-worker.json"), path.join(root, "raw"));
 assert.ok(receiptAccounting(receipt, result).amount > 0);
 const missing = structuredClone(receipt); missing.workflow.children = []; assert.throws(() => receiptAccounting(missing, result), /child/);
 const wrong = structuredClone(receipt); wrong.workflow.children[0].resolved.thinkingLevel = "high"; assert.throws(() => receiptAccounting(wrong, result), /Route/);
 for (const mutation of [
  msg => { msg.usageProvenance.rawUsage.input_tokens = 272001; },
  msg => { delete msg.usageProvenance.rawUsage.input_tokens_details.cache_write_tokens; },
  msg => { msg.stopReason = "error"; },
  msg => { msg.model = "gpt-5.6-sol"; },
 ]) {
  const r = structuredClone(receipt), p = r.workflow.children[0].process, e = JSON.parse(p.stdout); mutation(e.message); p.stdout = JSON.stringify(e);
  assert.throws(() => receiptAccounting(r, result), /usage|Route/);
 }
 const unended = structuredClone(receipt); unended.workflow.children[0].process.stdout += '{"type":"message_start","message":{"role":"assistant"}}\n';
 assert.throws(() => receiptAccounting(unended, result), /Incomplete/);
});
it("warning and hard stop charge probes, including full in-flight cost", async () => {
 const { out } = setup(); const warnings = []; let calls = 0;
 await assert.rejects(executeOffline(out, "probe", { onWarning: s => warnings.push(s), runner: async ({ casePath, outputDir }) => {
  calls++; synthetic(casePath, outputDir, 2000000);
 } }), /\$25/);
 const l = ledger(out); assert.equal(calls, 1); assert.ok(l.knownSpend > 25); assert.ok(warnings.some(s => s.includes("$15"))); assert.equal(l.blocked, true);
});
it("locks concurrency and detects sealed receipt/manifest tampering", async () => {
 const { out } = setup();
 await executeOffline(out, "probe", { runner: async ({ casePath, outputDir }) => {
  await assert.rejects(executeOffline(out, "probe", { runner: async () => assert.fail("concurrent launch") }), /Execution active|Incomplete launch/);
  synthetic(casePath, outputDir);
 } });
 const p = path.join(out, "probe-astra/run/receipt.json"); fs.appendFileSync(p, " "); assert.throws(() => ledger(out), /artifact changed/);
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
 assert.equal(l.groups["worker-component/astra-worker"].totalCost, null);
 assert.equal(l.groups["worker-component/astra-worker"].tailBreaches, null);
 assert.equal(l.remainingBudget, null);
});
it("preflight cannot race changed inputs into a launch; gates fail before launch marker", async () => {
 const { out, gates } = setup(); let calls = 0;
 await assert.rejects(executeOffline(out, "probe", {
  preflight: () => fs.appendFileSync(gates.runtime.binary, "changed"),
  runner: async () => { calls++; },
 }), /Runtime/);
 assert.equal(calls, 0); assert.equal(fs.readdirSync(path.join(out, "launches")).length, 0);
});
it("fixture additions and empty directories block before a model launch", async () => {
 const { out } = setup();
 const fixture = read(path.join(out, "cases/worker-deadline--astra-worker.json")).fixture;
 const added = path.join(fixture, "AGENTS.md");
 fs.writeFileSync(added, "unexpected instructions");
 let calls = 0;
 await assert.rejects(executeOffline(out, "probe", { runner: async () => { calls++; } }), /inventory changed/);
 assert.equal(calls, 0);
 fs.unlinkSync(added); fs.mkdirSync(path.join(fixture, ".pi"));
 assert.throws(() => ledger(out), /inventory changed/);
});
it("actual public-runner rejected actions retain complete parent cost without fictional children", async () => {
 const { out, root } = setup();
 const casePath = path.join(out, "cases/parent-deadline--luna-worker.json");
 for (const [index, text] of ["not workflow JSON", JSON.stringify({ action: "delegate", role: "worker", task: "Implement proposed.mjs" })].entries()) {
  const mock = createMockPi(); mock.install();
  try {
   mock.onCall({
    sessionEntries: [{ type: "model_change", provider: "openai-codex", modelId: "gpt-6-astra" }, { type: "thinking_level_change", thinkingLevel: "medium" }],
    jsonl: [{ type: "message_end", message: { role: "assistant", provider: "openai-codex", model: "gpt-6-astra", api: "openai-codex-responses", stopReason: "stop", content: [{ type: "text", text }], usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage: { input_tokens: 10, output_tokens: 10, total_tokens: 20, input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 } } } } }],
   });
   const run = await runBenchmarkCase({ casePath, outputDir: path.join(root, `rejected-${index}`), launchBudgetUsd: index ? 0.000001 : 25 });
   const receipt = read(run.receiptPath), result = read(run.resultPath);
   assert.equal(result.passed, false); assert.equal(mock.callCount(), 1);
   assert.equal(receipt.workflow.children.length, 0);
   assert.match(receipt.workflow.failures.join(" "), index ? /spend limit/ : /Invalid workflow action/);
   assert.equal(receiptAccounting(receipt, result).amount, result.benchmarkCost.amount);
   assert.ok(result.benchmarkCost.amount > 0);
  } finally { mock.uninstall(); }
 }
});
it("catalog listing, source and manifest hashes are independently frozen", () => {
 const { out, gates, gatesPath } = setup();
 fs.appendFileSync(gates.catalogListing.path, "changed"); assert.throws(() => ledger(out), /Catalog/);
 const text = fs.readFileSync(gates.catalogListing.path, "utf8"); fs.writeFileSync(gates.catalogListing.path, text.slice(0, -7));
 fs.appendFileSync(gatesPath, " "); assert.throws(() => ledger(out), /Frozen source/);
 fs.writeFileSync(gatesPath, fs.readFileSync(gatesPath, "utf8").trimEnd());
 const p = path.join(out, "manifest.json"); fs.chmodSync(p, 0o644); fs.appendFileSync(p, " "); assert.throws(() => ledger(out), /manifest/);
});
