// Screening-only operator. All inference uses the public runner, never a new transport.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import { runBenchmarkCase, parseBenchmarkCase } from "../../src/benchmark/runner.ts";
import { receiptAccounting } from "./accounting.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = p => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const write = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2) + "\n", { flag: "wx", mode: 0o444 });
const matrix = () => read(path.join(here, "matrix.json"));
export const historicalAccounting = Object.freeze({ knownSpend: 1.729328, reservation: 16.40, budgetCharge: 18.129328, measuredTotal: null, includedInNewAllowance: false });
function tree(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(e => {
    const p = path.join(directory, e.name);
    if (e.isDirectory()) return tree(p);
    if (!e.isFile()) throw new Error(`Unsupported linked/nonregular frozen file: ${p}`);
    return [p];
  });
}
function inventory(directory) {
  const entries = [];
  function visit(dir) {
    if (!fs.lstatSync(dir).isDirectory()) throw new Error(`Non-directory frozen root: ${dir}`);
    for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(dir, entry.name);
      if (!entry.isFile() && !entry.isDirectory()) throw new Error(`Nonregular frozen entry: ${file}`);
      entries.push([path.relative(directory, file), entry.isDirectory() ? "directory" : "file"]);
      if (entry.isDirectory()) visit(file);
    }
  }
  visit(directory);
  return entries;
}
export function runtimeDigest(binary) {
  const dir = path.dirname(fs.realpathSync(binary));
  return createHash("sha256").update(tree(dir).map(p => `${path.relative(dir, p)}\0${sha(p)}`).join("\n")).digest("hex");
}
export function schedule() {
  const arms = matrix().arms;
  const groups = ["worker-component", "orchestrated"];
  const entries = [];
  // Latin rotation: every tier occupies every within-group position once.
  for (let repetition = 1; repetition <= 3; repetition++) {
    for (const group of repetition % 2 ? groups : [...groups].reverse()) {
      for (let position = 0; position < 3; position++) {
        const arm = arms[(position + repetition - 1) % 3];
        const caseId = `${group === "orchestrated" ? "parent" : "worker"}-deadline--${arm.id}`;
        entries.push({ id: `${caseId}-${repetition}`, caseId, group, arm: arm.id, repetition, phase: "run" });
      }
    }
  }
  return entries;
}
function environment(g) {
  return { PATH: process.env.PATH, HOME: g.agentDir, PI_CODING_AGENT_DIR: g.agentDir, PI_SUBAGENT_PI_BINARY: g.runtime.binary, PI_OFFLINE: "1", PI_TELEMETRY: "0" };
}
// Catalog overlay is authoritative alongside the patched CLI; old source registry
// need not contain new IDs. Listing evidence must come from this isolated CLI.
export function validateGates(g) {
  if (g.schemaVersion !== 1 || g.transport !== "sse" || g.usageProvenance !== true || !path.isAbsolute(g.agentDir ?? "") || !path.isAbsolute(g.runtime?.binary ?? "") || g.runtime.binary !== fs.realpathSync(g.runtime.binary) || g.runtime.sha256 !== runtimeDigest(g.runtime.binary)) throw new Error("Runtime/isolation evidence mismatch");
  for (const [name, key] of [["settings.json", "settingsSha256"], ["models.json", "modelsSha256"]]) {
    const p = path.join(g.agentDir, name);
    if (!fs.lstatSync(p).isFile() || sha(p) !== g[key]) throw new Error(`Frozen configuration mismatch: ${name}`);
  }
  const settings = read(path.join(g.agentDir, "settings.json"));
  if (settings.transport !== "sse" || settings.enableInstallTelemetry !== false || settings.enableAnalytics !== false || settings.compaction?.enabled !== false || settings.retry?.enabled !== false || settings.retry?.maxRetries !== 0 || settings.retry?.provider?.maxRetries !== 0 || settings.defaultProjectTrust !== "never" || settings.enableSkillCommands !== false || ["packages", "extensions", "skills", "prompts", "themes"].some(k => !Array.isArray(settings[k]) || settings[k].length)) throw new Error("Unsafe isolated settings");
  const store = path.join(g.agentDir, "models-store.json");
  if (!fs.lstatSync(store).isFile() || sha(store) !== g.modelsStoreSha256) throw new Error("Frozen models-store mismatch");
  const overlay = read(path.join(g.agentDir, "models.json"));
  if (Object.keys(overlay.providers ?? {}).join() !== "openai-codex") throw new Error("Codex-only catalog overlay required");
  if (!path.isAbsolute(g.catalogListing?.path ?? "") || sha(g.catalogListing.path) !== g.catalogListing.sha256) throw new Error("Catalog listing evidence mismatch");
  const listing = fs.readFileSync(g.catalogListing.path, "utf8");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.pricingVerifiedAt ?? "") || !Number.isFinite(Date.parse(g.pricingVerifiedAt))) throw new Error("Dated pricing verification required");
  for (const [tier, model] of Object.entries(matrix().models)) {
    const query = `${model.route.model}:medium`;
    if (!g.checks?.some(c => c.query === query && c.resolved === query && c.effortSupported === true)) throw new Error(`Missing exact model/effort evidence: ${query}`);
    const id = model.route.model.split("/")[1];
    const configured = overlay.providers["openai-codex"].models?.find(m => m.id === id);
    if (!configured || configured.api !== "openai-codex-responses" || configured.thinkingLevelMap?.medium !== "medium" || configured.reasoning !== true || configured.contextWindow !== 272000 || ["input", "output", "cacheRead", "cacheWrite"].some(k => configured.cost?.[k] !== model.pricingReference[k])) throw new Error(`Overlay Route/pricing mismatch: ${id}`);
    if (!listing.split(/\r?\n/).some(line => line.split(/\s+/).includes(id) && line.includes("openai-codex"))) throw new Error(`Missing offline catalog model: ${id}`);
    if (!isDeepStrictEqual(g.pricing?.[tier], model.pricingReference)) throw new Error(`Pricing verification mismatch: ${tier}`);
  }
}
function livePreflight(g) {
  validateGates(g);
  // Credentials only inspected for provider names; never copied, hashed or printed.
  const auth = path.join(g.agentDir, "auth.json");
  if (!fs.lstatSync(auth).isFile() || Object.keys(read(auth)).join() !== "openai-codex") throw new Error("Codex-only isolated credentials required");
  for (const name of fs.readdirSync(g.agentDir)) if (!["auth.json", "settings.json", "models.json", "models-store.json", "sessions"].includes(name)) throw new Error("Unexpected isolated configuration entry");
  const listing = execFileSync(process.execPath, [g.runtime.binary, "--list-models", "openai-codex"], { env: environment(g), cwd: g.agentDir, encoding: "utf8", timeout: 30000, stdio: ["ignore", "pipe", "pipe"] });
  if (listing !== fs.readFileSync(g.catalogListing.path, "utf8")) throw new Error("Actual offline catalog listing changed");
}
export function prepare(output, drafts, gatesPath) {
  output = path.resolve(output); drafts = path.resolve(drafts);
  if (fs.existsSync(output)) throw new Error("Campaign directory already exists; no resets");
  const d = read(path.join(drafts, "manifest.json")), g = read(gatesPath);
  validateGates(g);
  if (!isDeepStrictEqual(d.matrix, matrix())) throw new Error("Draft matrix changed");
  const frozen = {};
  for (const s of d.sources) {
    const p = path.resolve(drafts, s.path);
    if (sha(p) !== s.sha256) throw new Error(`Frozen draft source changed: ${p}`);
    frozen[p] = s.sha256;
  }
  for (const p of [...tree(path.join(root, "src")), ...tree(path.join(root, "agents")), ...tree(here), ...tree(path.join(root, "test/support")), ...["index.ts", "benchmark-runner.mjs", "package.json", "package-lock.json"].map(p => path.join(root, p))]) frozen[p] = sha(p);
  frozen[path.resolve(gatesPath)] = sha(gatesPath);
  frozen[path.join(drafts, "manifest.json")] = sha(path.join(drafts, "manifest.json"));
  const inventories = {};
  const cases = {};
  for (const e of d.cases.filter(e => e.stage === "screening")) {
    const p = path.join(drafts, e.file);
    if (sha(p) !== e.sha256) throw new Error("Draft changed");
    frozen[p] = sha(p);
    const c = read(p);
    const expected = schedule().find(s => s.caseId === e.id);
    const tier = matrix().arms.find(a => a.id === e.arm)?.worker;
    if (!expected || expected.group !== e.group || expected.arm !== e.arm || c.id !== e.id || !tier || !isDeepStrictEqual(c.candidateRoute, matrix().models[e.group === "orchestrated" ? "astra" : tier].route)) throw new Error("Draft workflow-arm mismatch");
    if ((e.group === "orchestrated") !== Boolean(c.workflow)) throw new Error("Draft workflow group mismatch");
    for (const child of c.workflow?.children ?? []) if (!isDeepStrictEqual(child.candidateRoute, matrix().models[child.role === "worker" ? tier : "astra"].route)) throw new Error("Draft child Route mismatch");
    function promote(spec) {
      const model = Object.values(matrix().models).find(m => isDeepStrictEqual(m.route, spec.candidateRoute));
      if (!model || spec.route || spec.currentPricing) throw new Error("Invalid draft promotion");
      spec.route = spec.candidateRoute; delete spec.candidateRoute;
      spec.currentPricing = model.pricingReference;
    }
    promote(c);
    for (const child of c.workflow?.children ?? []) promote(child);
    c.fixture = path.resolve(path.dirname(p), c.fixture);
    inventories[c.fixture] = inventory(c.fixture);
    c.evaluator.args = c.evaluator.args.map(a => a.replaceAll("{caseDir}", path.dirname(p)));
    cases[e.id] = parseBenchmarkCase(c);
  }
  const probes = Object.entries(matrix().models).map(([tier, model]) => {
    const id = `probe-${tier}`;
    cases[id] = parseBenchmarkCase({ id, agentRole: "delegate", route: model.route, currentPricing: model.pricingReference, prompt: "Do not use tools or change files. Reply with exactly OK.", evaluator: { kind: "output-includes", expected: "OK" }, timeoutMs: 90000, mutationPolicy: "forbid" });
    return { id, caseId: id, group: "probe", arm: `${tier}-worker`, phase: "probe" };
  });
  const entries = [...probes, ...schedule()];
  if (Object.keys(cases).length !== 9 || entries.some(e => !cases[e.caseId])) throw new Error("Incomplete screening draft set");
  fs.mkdirSync(output);
  for (const name of ["cases", "launches", "completions"]) fs.mkdirSync(path.join(output, name));
  for (const [id, c] of Object.entries(cases)) write(path.join(output, "cases", `${id}.json`), c);
  write(path.join(output, "manifest.json"), { schemaVersion: 1, allowance: 25, warning: 15, historicalAccounting, concurrency: 1, gates: g, frozen, inventories, entries, caseHashes: Object.fromEntries(Object.keys(cases).map(id => [`cases/${id}.json`, sha(path.join(output, "cases", `${id}.json`))])) });
  write(path.join(output, "manifest-seal.json"), { sha256: sha(path.join(output, "manifest.json")) });
  return ledger(output);
}
function verify(output) {
  if (read(path.join(output, "manifest-seal.json")).sha256 !== sha(path.join(output, "manifest.json"))) throw new Error("Frozen manifest changed");
  const m = read(path.join(output, "manifest.json"));
  for (const [p, hash] of Object.entries(m.frozen)) if (sha(p) !== hash) throw new Error(`Frozen source changed: ${p}`);
  for (const [p, hash] of Object.entries(m.caseHashes)) if (sha(path.join(output, p)) !== hash) throw new Error(`Frozen case changed: ${p}`);
  for (const [directory, expected] of Object.entries(m.inventories)) if (!isDeepStrictEqual(inventory(directory), expected)) throw new Error(`Frozen fixture inventory changed: ${directory}`);
  validateGates(m.gates);
  return m;
}
export function ledger(output) { return inspect(path.resolve(output)); }
function inspect(output, ownsLock = false) {
  const m = verify(output), entries = [], remaining = [];
  const allowed = new Set(["manifest.json", "manifest-seal.json", "cases", "launches", "completions", ".execution-lock", ...m.entries.map(e => e.id)]);
  for (const p of fs.readdirSync(output)) if (!allowed.has(p)) throw new Error(`Unexpected campaign artifact: ${p}`);
  for (const name of ["launches", "completions"]) for (const p of fs.readdirSync(path.join(output, name))) if (!m.entries.some(e => `${e.id}.json` === p)) throw new Error("Unexpected attempt marker");
  let unknownSpend = false;
  let knownSpend = 0, gap = false, issue = !ownsLock && fs.existsSync(path.join(output, ".execution-lock")) ? "Execution active/interrupted; manual review required" : null;
  for (const e of m.entries) {
    const dir = path.join(output, e.id), marker = path.join(output, "launches", `${e.id}.json`), anchor = path.join(output, "completions", `${e.id}.json`);
    if (![dir, marker, anchor].some(p => fs.existsSync(p))) { gap = true; remaining.push(e); continue; }
    if (gap) throw new Error(`Out-of-order attempt: ${e.id}`);
    if (![marker, anchor, ...["launch.json", "complete.json", "run/result.json", "run/receipt.json"].map(p => path.join(dir, p))].every(p => fs.existsSync(p))) { unknownSpend = true; issue = `Incomplete launch ${e.id}; unknown spend, never retry`; const failurePath = path.join(dir, "failure.json"); const failure = fs.existsSync(failurePath) ? read(failurePath) : null; entries.push({ ...e, incomplete: true, wallTimeMs: failure?.wallTimeMs, failureCategory: failure?.category ?? "interrupted-or-active" }); continue; }
    if (sha(marker) !== sha(path.join(dir, "launch.json")) || read(anchor).sha256 !== sha(path.join(dir, "complete.json"))) throw new Error("Attempt anchor changed");
    const seal = read(path.join(dir, "complete.json"));
    for (const p of ["launch.json", "run/result.json", "run/receipt.json"]) if (sha(path.join(dir, p)) !== seal.hashes[p]) throw new Error("Attempt artifact changed");
    const launch = read(marker);
    if (launch.id !== e.id || launch.budgetCharge !== charge(knownSpend) || launch.budgetCharge >= 25) throw new Error("Launch accounting mismatch");
    const result = read(path.join(dir, "run/result.json")), receipt = read(path.join(dir, "run/receipt.json"));
    if (!isDeepStrictEqual(receipt.case, parseBenchmarkCase(read(path.join(output, "cases", `${e.caseId}.json`))))) throw new Error("Receipt case mismatch");
    let accounting = null;
    try {
      for (const resolved of [result.resolved, receipt.resolved]) if (resolved?.complete !== true || resolved.model !== receipt.case.route.model || resolved.thinkingLevel !== "medium") throw new Error("Resolved Route mismatch");
      accounting = receiptAccounting(receipt, result);
      knownSpend += accounting.amount;
      if (result.telemetry?.passed !== true) throw new Error("Incomplete telemetry");
    } catch (error) { accounting = null; unknownSpend = true; issue = `Unknown accounting ${e.id}: ${error.message}`; }
    const processes = receipt.workflow ? [...receipt.workflow.parents, ...receipt.workflow.children].map(p => p.process) : [receipt.candidate];
    const transportFailure = processes.some(p => !p || p.exitCode !== 0 || p.timedOut === true);
    entries.push({ ...e, passed: result.passed === true, transportFailure, result, accounting, wallTimeMs: seal.wallTimeMs });
    if (e.phase === "probe" && (result.passed !== true || transportFailure)) issue = `Failed runtime probe ${e.id}; screening gated`;
  }
  if (!Number.isFinite(knownSpend)) { unknownSpend = true; issue = "Spend overflow"; }
  const budgetCharge = charge(knownSpend);
  const groups = {};
  for (const e of entries.filter(e => e.phase === "run")) {
    const key = `${e.group}/${e.arm}`;
    const g = groups[key] ??= { attempts: 0, accepted: 0, failures: 0, transportFailures: 0, totalCost: 0, wallTimeMs: 0, cumulativeOutputTokens: 0, peakContextLoad: 0, tailBreaches: 0 };
    g.attempts++; g.accepted += e.passed ? 1 : 0; g.failures += e.passed ? 0 : 1; g.transportFailures += e.transportFailure ? 1 : 0;
    g.totalCost = g.totalCost === null || !e.accounting ? null : g.totalCost + e.accounting.amount;
    g.wallTimeMs = g.wallTimeMs === null || e.wallTimeMs === undefined ? null : g.wallTimeMs + e.wallTimeMs;
    const turns = e.accounting?.turns;
    g.cumulativeOutputTokens = g.cumulativeOutputTokens === null || !turns ? null : g.cumulativeOutputTokens + turns.reduce((n, t) => n + t.output, 0);
    g.peakContextLoad = g.peakContextLoad === null || !turns ? null : Math.max(g.peakContextLoad, ...turns.map(t => t.contextLoad));
    g.tailBreaches = g.tailBreaches === null || !turns ? null : g.tailBreaches + (turns.some(t => t.contextLoad > 150000) ? 1 : 0);
  }
  for (const g of Object.values(groups)) { g.acceptanceRate = g.accepted / g.attempts; g.costPerAccepted = g.accepted && g.totalCost !== null ? g.totalCost / g.accepted : null; }
  return { historicalAccounting, allowance: 25, knownSpend, measuredTotal: unknownSpend ? null : knownSpend, budgetCharge, remainingBudget: unknownSpend ? null : Math.max(0, 25 - budgetCharge), warning: budgetCharge >= 15, blocked: Boolean(issue) || budgetCharge >= 25, issue, entries, remaining, groups };
}
const charge = n => Math.ceil(n * 1e6 - 1e-8) / 1e6;
export async function execute(output, phase) { return executeWith(output, phase, runBenchmarkCase, livePreflight, console.error); }
// No default live runner, no production preflight override.
export async function executeOffline(output, phase, { runner, preflight = validateGates, onWarning = () => {} }) {
  if (typeof runner !== "function" || runner === runBenchmarkCase) throw new Error("Offline harness requires mock public runner");
  return executeWith(output, phase, runner, preflight, onWarning);
}
async function executeWith(output, phase, runner, preflight, onWarning) {
  if (!["probe", "run"].includes(phase)) throw new Error("Expected probe or run");
  output = path.resolve(output);
  const initial = ledger(output);
  if (initial.blocked) throw new Error(initial.issue ?? "PRE-LAUNCH STOP $25");
  if (phase === "run" && initial.entries.filter(e => e.phase === "probe" && e.passed && e.accounting).length !== 3) throw new Error("Three successful charged probes required");
  const lock = path.join(output, ".execution-lock"); write(lock, { pid: process.pid });
  try {
    for (const e of initial.remaining.filter(e => e.phase === phase)) {
      const before = inspect(output, true);
      if (before.warning) onWarning(`WARNING $15 reached: $${before.budgetCharge}`);
      if (before.blocked) throw new Error(before.issue ?? "PRE-LAUNCH STOP $25");
      const m = verify(output); preflight(m.gates);
      if (inspect(output, true).blocked) throw new Error("Campaign blocked during preflight");
      const dir = path.join(output, e.id), launch = { id: e.id, budgetCharge: before.budgetCharge, startedAt: new Date().toISOString() };
      write(path.join(output, "launches", `${e.id}.json`), launch);
      fs.mkdirSync(dir); write(path.join(dir, "launch.json"), launch);
      const start = performance.now();
      try { await runner({ casePath: path.join(output, "cases", `${e.caseId}.json`), outputDir: path.join(dir, "run"), env: environment(m.gates), launchBudgetUsd: before.remainingBudget }); }
      catch (error) { write(path.join(dir, "failure.json"), { wallTimeMs: performance.now() - start, category: "runner-threw", spend: null }); throw new Error(`Runner failed ${e.id}; artifacts retained, unknown spend, never retry`, { cause: error }); }
      write(path.join(dir, "complete.json"), { wallTimeMs: performance.now() - start, hashes: Object.fromEntries(["launch.json", "run/result.json", "run/receipt.json"].map(p => [p, sha(path.join(dir, p))])) });
      write(path.join(output, "completions", `${e.id}.json`), { sha256: sha(path.join(dir, "complete.json")) });
      const after = inspect(output, true);
      if (after.warning) onWarning(`WARNING $15 reached: $${after.budgetCharge}`);
      if (after.blocked) throw new Error(after.issue ?? "PRE-LAUNCH STOP $25; in-flight attempt retained");
    }
  } finally { fs.unlinkSync(lock); }
  return ledger(output);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, output, drafts, gates] = process.argv.slice(2);
  if (!output) throw new Error("Usage: campaign.mjs prepare NEW_OUTPUT DRAFTS GATES | probe OUTPUT | run OUTPUT | ledger OUTPUT");
  const result = command === "prepare" ? prepare(output, drafts, gates) : command === "ledger" ? ledger(output) : await execute(output, command);
  console.log(JSON.stringify(result, null, 2));
}
