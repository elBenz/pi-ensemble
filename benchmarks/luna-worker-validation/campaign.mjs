// Carry-forward full-worker operator. All inference uses the public runner, never a new transport.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { performance } from "node:perf_hooks";
import { runBenchmarkCase, parseBenchmarkCase } from "../../src/benchmark/runner.ts";
import { receiptAccounting } from "../gpt6-comparison/accounting.mjs";
import { schedule as priorSchedule } from "../gpt6-comparison/campaign.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const sha = p => createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const write = (p, v) => {
  const fd = fs.openSync(p, "wx", 0o444);
  try { fs.writeFileSync(fd, JSON.stringify(v, null, 2) + "\n"); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  const directory = fs.openSync(path.dirname(p), "r");
  try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
};
const matrix = () => read(path.join(root, "benchmarks/gpt6-comparison/matrix.json"));
import { gunzipSync } from "node:zlib";
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
export const taskIds = ["deadline-preservation", "replay-boundary", "record-validation", "config-layering", "queue-recovery", "artifact-pipeline"];
export const arms = ["Luna-medium", "Luna-high", "Sol-medium"];
function modelFor(arm) {
  const [tier, thinkingLevel] = arm.toLowerCase().split("-");
  const m = matrix().models[tier];
  return { route: { ...m.route, thinkingLevel }, currentPricing: m.pricingReference };
}
export function schedule() {
  const entries = [];
  for (let repetition = 1; repetition <= 3; repetition++) for (const task of taskIds) for (let position = 0; position < 3; position++) {
    const arm = arms[(position + repetition - 1) % 3], caseId = `${task}--${arm}`;
    entries.push({ id: `${caseId}-${repetition}`, caseId, group: task, arm, repetition, phase: "run" });
  }
  return entries;
}
const digest = text => createHash("sha256").update(text).digest("hex");
// Approval pins bytes, not a hand-entered balance. Every raw turn is recomputed.
export function auditPrior(approval) {
  for (const key of ["archive", "ledger"]) if (!path.isAbsolute(approval[key]?.path ?? "") || sha(approval[key].path) !== approval[key].sha256) throw new Error("Prior provenance approval mismatch");
  const a = JSON.parse(gunzipSync(fs.readFileSync(approval.archive.path))), l = read(approval.ledger.path);
  const get = p => { if (typeof a.files[p] !== "string") throw new Error(`Missing archived evidence ${p}`); return JSON.parse(a.files[p]); };
  const check = (p, hash) => { if (digest(a.files[p] ?? "") !== hash) throw new Error(`Archived digest mismatch ${p}`); };
  const m = get("manifest.json"); check("manifest.json", get("manifest-seal.json").sha256);
  if (a.schemaVersion !== 1 || m.entries.length !== 21 || l.entries.length !== 21 || l.remaining.length || l.blocked || l.allowance !== 25) throw new Error("Prior campaign incomplete");
  const expectedEntries = [...["astra", "sol", "luna"].map(tier => ({ id: `probe-${tier}`, caseId: `probe-${tier}`, group: "probe", arm: `${tier}-worker`, phase: "probe" })), ...priorSchedule()];
  if (!isDeepStrictEqual(m.entries, expectedEntries)) throw new Error("Prior schedule mismatch");
  for (const [p, h] of Object.entries(m.caseHashes)) check(p, h);
  for (const [p, h] of Object.entries(m.frozen)) if (digest(a.publicInputs[p] ?? "") !== h) throw new Error(`Archived public input mismatch ${p}`);
  for (const [name, key] of [["settings.json", "settingsSha256"], ["models.json", "modelsSha256"], ["models-store.json", "modelsStoreSha256"]]) if (digest(a.publicInputs[path.join(m.gates.agentDir, name)] ?? "") !== m.gates[key]) throw new Error("Archived config mismatch");
  let knownSpend = 0;
  const ids = new Set();
  for (const e of m.entries) {
    if (ids.has(e.id)) throw new Error("Duplicate prior attempt"); ids.add(e.id);
    const seal = get(`${e.id}/complete.json`);
    check(`${e.id}/complete.json`, get(`completions/${e.id}.json`).sha256);
    for (const p of ["launch.json", "run/receipt.json", "run/result.json"]) check(`${e.id}/${p}`, seal.hashes[p]);
    check(`launches/${e.id}.json`, digest(a.files[`${e.id}/launch.json`]));
    const launch = get(`${e.id}/launch.json`);
    if (launch.id !== e.id || launch.budgetCharge !== charge(knownSpend) || launch.budgetCharge >= 25) throw new Error("Prior launch balance mismatch");
    const receipt = get(`${e.id}/run/receipt.json`), result = get(`${e.id}/run/result.json`);
    if (!isDeepStrictEqual(receipt.case, parseBenchmarkCase(get(`cases/${e.caseId}.json`)))) throw new Error("Prior case mismatch");
    for (const spec of [receipt.case, ...(receipt.case.workflow?.children ?? [])]) {
      const expected = Object.values(matrix().models).find(x => isDeepStrictEqual(x.route, spec.route));
      if (!expected || !isDeepStrictEqual(expected.pricingReference, spec.currentPricing)) throw new Error("Prior Route/pricing mismatch");
    }
    const accounting = receiptAccounting(receipt, result);
    if (!result.telemetry?.passed || !isDeepStrictEqual(l.entries.find(x => x.id === e.id)?.result, result)) throw new Error("Prior ledger/result mismatch");
    if (e.phase === "probe" && (!result.passed || receipt.candidate.exitCode !== 0 || receipt.candidate.timedOut)) throw new Error("Prior probe failed");
    knownSpend += accounting.amount;
  }
  for (const id of ["probe-luna", "probe-sol", "probe-astra"]) if (!ids.has(id)) throw new Error("Missing prior probes");
  if (Math.abs(knownSpend - l.knownSpend) > 1e-12 || l.measuredTotal !== l.knownSpend || charge(knownSpend) !== l.budgetCharge) throw new Error("Prior total mismatch");
  return { knownSpend, budgetCharge: charge(knownSpend), gates: m.gates, provenance: approval };
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
  const high = "openai-codex/gpt-6-luna:high";
  if (!g.checks?.some(c => c.query === high && c.resolved === high && c.effortSupported === true)) throw new Error("Missing exact high effort evidence");
  if (read(path.join(g.agentDir, "models.json")).providers?.["openai-codex"]?.models?.find(m => m.id === "gpt-6-luna")?.thinkingLevelMap?.high !== "high") throw new Error("High effort overlay mismatch");
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
export function prepare(output, corpus, gatesPath, approvalPath) {
  output = path.resolve(output); corpus = path.resolve(corpus);
  if (fs.existsSync(output)) throw new Error("Campaign directory already exists; no resets");
  const approval = read(approvalPath), prior = auditPrior(approval), g = read(gatesPath);
  validateGates(g);
  for (const key of ["runtime", "settingsSha256", "modelsSha256", "modelsStoreSha256", "pricing", "catalogListing"]) if (!isDeepStrictEqual(g[key], prior.gates[key])) throw new Error(`Inherited probe configuration changed: ${key}`);
  const d = read(path.join(corpus, "corpus.json"));
  if (d.schemaVersion !== 1 || !isDeepStrictEqual(d.cases.map(c => c.id).sort(), [...taskIds].sort())) throw new Error("Exact six-task corpus required");
  const frozen = {}, inventories = {}, cases = {};
  for (const dir of [path.dirname(fs.realpathSync(g.runtime.binary)), corpus, path.join(root, "src"), path.join(root, "agents"), here, path.join(root, "benchmarks/gpt6-comparison"), path.join(root, "test/support")]) {
    inventories[dir] = inventory(dir);
    for (const p of tree(dir)) frozen[p] = sha(p);
  }
  for (const p of [gatesPath, approvalPath, approval.archive.path, approval.ledger.path, ...["index.ts", "benchmark-runner.mjs", "package.json", "package-lock.json"].map(p => path.join(root, p))]) frozen[path.resolve(p)] = sha(p);
  for (const e of d.cases) {
    if (e.case !== `cases/${e.id}/case.json` || typeof e.kind !== "string") throw new Error("Invalid corpus entry");
    const p = path.join(corpus, e.case), base = read(p);
    if (base.agentRole !== "worker" || base.workflow || !base.fixture) throw new Error("Full worker fixture required");
    base.fixture = path.resolve(path.dirname(p), base.fixture);
    inventories[base.fixture] = inventory(base.fixture);
    for (const f of tree(base.fixture)) frozen[f] = sha(f);
    if (base.evaluator?.args) base.evaluator.args = base.evaluator.args.map(a => a.replaceAll("{caseDir}", path.dirname(p)));
    // Absolute evaluator dependencies outside corpus are frozen too.
    for (const dependency of [base.evaluator?.command, ...(base.evaluator?.args ?? [])]) {
      if (typeof dependency === "string" && path.isAbsolute(dependency) && fs.existsSync(dependency)) {
        if (!fs.lstatSync(dependency).isFile()) throw new Error("Nonregular evaluator dependency");
        frozen[dependency] = sha(dependency);
      }
    }
    for (const arm of arms) {
      const id = `${e.id}--${arm}`;
      cases[id] = parseBenchmarkCase({ ...base, id, ...modelFor(arm) });
    }
  }
  const id = "probe-Luna-high";
  cases[id] = parseBenchmarkCase({ id, agentRole: "delegate", ...modelFor("Luna-high"), prompt: "Do not use tools or change files. Reply with exactly OK.", evaluator: { kind: "output-includes", expected: "OK" }, timeoutMs: 90000, mutationPolicy: "forbid" });
  const entries = [{ id, caseId: id, group: "probe", arm: "Luna-high", phase: "probe" }, ...schedule()];
  fs.mkdirSync(output);
  for (const name of ["cases", "launches", "completions"]) fs.mkdirSync(path.join(output, name));
  for (const [id, c] of Object.entries(cases)) write(path.join(output, "cases", `${id}.json`), c);
  write(path.join(output, "manifest.json"), { schemaVersion: 1, allowance: 25, warning: 15, historicalAccounting, prior, concurrency: 1, gates: g, frozen, inventories, entries, caseHashes: Object.fromEntries(Object.keys(cases).map(id => [`cases/${id}.json`, sha(path.join(output, "cases", `${id}.json`))])) });
  write(path.join(output, "manifest-seal.json"), { sha256: sha(path.join(output, "manifest.json")) });
  return ledger(output);
}
function verify(output) {
  if (read(path.join(output, "manifest-seal.json")).sha256 !== sha(path.join(output, "manifest.json"))) throw new Error("Frozen manifest changed");
  const m = read(path.join(output, "manifest.json"));
  for (const [p, hash] of Object.entries(m.frozen)) if (sha(p) !== hash) throw new Error(`Frozen source changed: ${p}`);
  if (!isDeepStrictEqual(inventory(path.join(output, "cases")), Object.keys(m.caseHashes).map(p => [path.basename(p), "file"]).sort((a, b) => a[0].localeCompare(b[0])))) throw new Error("Frozen case inventory changed");
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
  let knownSpend = m.prior.knownSpend, gap = false, issue = !ownsLock && fs.existsSync(path.join(output, ".execution-lock")) ? "Execution active/interrupted; manual review required" : null;
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
      for (const resolved of [result.resolved, receipt.resolved]) if (resolved?.complete !== true || resolved.model !== receipt.case.route.model || resolved.thinkingLevel !== receipt.case.route.thinkingLevel) throw new Error("Resolved Route mismatch");
      accounting = receiptAccounting(receipt, result);
      knownSpend += accounting.amount;
      if (result.telemetry?.passed !== true) throw new Error("Incomplete telemetry");
    } catch (error) { accounting = null; unknownSpend = true; issue = `Unknown accounting ${e.id}: ${error.message}`; }
    const processes = receipt.workflow ? [...receipt.workflow.parents, ...receipt.workflow.children].map(p => p.process) : [receipt.candidate];
    const transportFailure = processes.some(p => !p || p.exitCode !== 0 || p.timedOut === true);
    entries.push({ ...e, passed: result.passed === true && !transportFailure && accounting !== null, transportFailure, result, accounting, wallTimeMs: seal.wallTimeMs });
    if (e.phase === "probe" && (result.passed !== true || transportFailure)) issue = `Failed runtime probe ${e.id}; screening gated`;
  }
  if (!Number.isFinite(knownSpend)) { unknownSpend = true; issue = "Spend overflow"; }
  const budgetCharge = charge(knownSpend);
  const groups = {};
  for (const e of entries.filter(e => e.phase === "run")) {
    for (const key of [`${e.group}/${e.arm}`, `overall/${e.arm}`]) {
    const g = groups[key] ??= { attempts: 0, accepted: 0, failures: 0, transportFailures: 0, totalCost: 0, wallTimeMs: 0, cumulativeOutputTokens: 0, peakContextLoad: 0, tailBreaches: 0, walls: [], acceptedCost: 0 };
    g.walls.push(e.wallTimeMs ?? null);
    if (e.passed) g.acceptedCost = g.acceptedCost === null || !e.accounting ? null : g.acceptedCost + e.accounting.amount;
    g.attempts++; g.accepted += e.passed ? 1 : 0; g.failures += e.passed ? 0 : 1; g.transportFailures += e.transportFailure ? 1 : 0;
    g.totalCost = g.totalCost === null || !e.accounting ? null : g.totalCost + e.accounting.amount;
    g.wallTimeMs = g.wallTimeMs === null || e.wallTimeMs === undefined ? null : g.wallTimeMs + e.wallTimeMs;
    const turns = e.accounting?.turns;
    g.cumulativeOutputTokens = g.cumulativeOutputTokens === null || !turns ? null : g.cumulativeOutputTokens + turns.reduce((n, t) => n + t.output, 0);
    g.peakContextLoad = g.peakContextLoad === null || !turns ? null : Math.max(g.peakContextLoad, ...turns.map(t => t.contextLoad));
    g.tailBreaches = g.tailBreaches === null || !turns ? null : g.tailBreaches + (turns.some(t => t.contextLoad > 150000) ? 1 : 0);
  }
  }
  for (const g of Object.values(groups)) { const walls = g.walls; delete g.walls; walls.sort((a,b) => a-b); g.medianWallTimeMs = walls.includes(null) ? null : (walls[Math.floor((walls.length-1)/2)] + walls[Math.floor(walls.length/2)]) / 2; g.acceptanceRate = g.accepted / g.attempts; g.costPerAccepted = g.accepted && g.totalCost !== null ? g.totalCost / g.accepted : null; }
  return { historicalAccounting, prior: m.prior, newSpend: knownSpend - m.prior.knownSpend, allowance: 25, knownSpend, measuredTotal: unknownSpend ? null : knownSpend, budgetCharge, remainingBudget: unknownSpend ? null : Math.max(0, 25 - budgetCharge), warning: budgetCharge >= 15, blocked: Boolean(issue) || budgetCharge >= 25, issue, entries, remaining, groups };
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
  if (phase === "run" && initial.entries.filter(e => e.phase === "probe" && e.passed && e.accounting).length !== 1) throw new Error("Successful charged high probe required");
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
  const [command, output, drafts, gates, approval] = process.argv.slice(2);
  if (!output) throw new Error("Usage: campaign.mjs prepare NEW_OUTPUT CORPUS GATES APPROVAL | probe OUTPUT | run OUTPUT | ledger OUTPUT");
  const result = command === "prepare" ? prepare(output, drafts, gates, approval) : command === "ledger" ? ledger(output) : await execute(output, command);
  console.log(JSON.stringify(result, null, 2));
}
