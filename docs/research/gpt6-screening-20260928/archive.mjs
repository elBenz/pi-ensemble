// Offline archive only: no runtime/provider/authentication access or model launches.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
const source = path.resolve(process.argv[2]);
const destination = path.dirname(fileURLToPath(import.meta.url));
const read = p => JSON.parse(fs.readFileSync(p, "utf8"));
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
const sha = p => hash(fs.readFileSync(p));
const save = (name, bytes) => fs.writeFileSync(path.join(destination, name), bytes, { flag: "wx", mode: 0o444 });
const m = read(path.join(source, "manifest.json"));
if (sha(path.join(source, "manifest.json")) !== read(path.join(source, "manifest-seal.json")).sha256) throw new Error("Manifest changed");
const ledger = read(path.join(path.dirname(source), "screening-ledger.json"));
if (ledger.entries.length !== m.entries.length || ledger.remaining.length || ledger.blocked || ledger.measuredTotal === null) throw new Error("Expected completed, priceable campaign");
const files = {};
function retain(relative) { files[relative] = fs.readFileSync(path.join(source, relative), "utf8"); }
for (const name of ["manifest.json", "manifest-seal.json", ...Object.keys(m.caseHashes)]) retain(name);
for (const entry of m.entries) {
 const seal = read(path.join(source, entry.id, "complete.json"));
 if (read(path.join(source, "completions", `${entry.id}.json`)).sha256 !== sha(path.join(source, entry.id, "complete.json"))) throw new Error("Completion anchor changed");
 for (const [relative, expected] of Object.entries(seal.hashes)) if (sha(path.join(source, entry.id, relative)) !== expected) throw new Error("Run artifact changed");
 for (const relative of ["launch.json", "complete.json", "run/receipt.json", "run/result.json"]) retain(`${entry.id}/${relative}`);
 retain(`launches/${entry.id}.json`); retain(`completions/${entry.id}.json`);
}
for (const [relative, expected] of Object.entries(m.caseHashes)) if (sha(path.join(source, relative)) !== expected) throw new Error("Case changed");
// Public source/config only. Deliberately never read auth.json or session stores.
const publicInputs = {};
for (const [file, expected] of Object.entries(m.frozen)) {
 if (sha(file) !== expected) throw new Error(`Frozen source changed: ${file}`);
 publicInputs[file] = fs.readFileSync(file, "utf8");
}
for (const name of ["settings.json", "models.json", "models-store.json"]) publicInputs[path.join(m.gates.agentDir, name)] = fs.readFileSync(path.join(m.gates.agentDir, name), "utf8");
publicInputs[m.gates.catalogListing.path] = fs.readFileSync(m.gates.catalogListing.path, "utf8");
const bytes = gzipSync(JSON.stringify({ schemaVersion: 1, files, publicInputs }));
save("artifacts.json.gz", bytes);
save("ledger.json", JSON.stringify(ledger, null, 2) + "\n");
const median = numbers => { const n = [...numbers].sort((a,b) => a-b); const mid = Math.floor(n.length/2); return n.length % 2 ? n[mid] : (n[mid-1]+n[mid])/2; };
const groups = Object.fromEntries(Object.entries(ledger.groups).map(([key, group]) => {
 const entries = ledger.entries.filter(e => `${e.group}/${e.arm}` === key);
 const roleCosts = {};
 for (const entry of entries) for (const c of entry.accounting.components) roleCosts[c.role] = (roleCosts[c.role] ?? 0) + c.amount;
 return [key, { ...group, meanCostPerAttempt: group.totalCost / group.attempts, medianSeconds: median(entries.map(e=>e.wallTimeMs/1000)), acceptedMedianSeconds: group.accepted ? median(entries.filter(e=>e.passed).map(e=>e.wallTimeMs/1000)) : null, roleCosts }];
}));
const summary = { schemaVersion: 1, source, observedAt: "2026-09-28", screeningAttempts: 18, probes: 3, totalBenchmarkCost: ledger.measuredTotal, budgetCharge: ledger.budgetCharge, remainingBudget: ledger.remainingBudget, historicalAccounting: ledger.historicalAccounting, groups, artifactSha256: hash(bytes), ledgerSha256: sha(path.join(destination,"ledger.json")) };
save("summary.json", JSON.stringify(summary,null,2)+"\n");
console.log(JSON.stringify({destination, artifactsBytes:bytes.length, totalBenchmarkCost:summary.totalBenchmarkCost, groups},null,2));
