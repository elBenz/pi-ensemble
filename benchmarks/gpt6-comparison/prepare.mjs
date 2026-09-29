import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const slash = (value) => value.split(path.sep).join("/");
const writeJson = (file, value) => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });

// Drafts deliberately omit required `route`. Neither case nor plan runner can
// launch them. Candidate routes and reference prices need explicit promotion
// after runtime, accounting and authorization gates; this module has no runner.
export function prepareComparison(outputDirectory) {
  const output = path.resolve(outputDirectory);
  if (fs.existsSync(output)) throw new Error(`Output directory already exists: ${output}`);
  const matrix = readJson(path.join(here, "matrix.json"));
  const prepared = [];
  const sources = new Map();
  function record(file) {
    const absolute = path.resolve(file);
    sources.set(absolute, sha256(fs.readFileSync(absolute)));
  }
  function recordTree(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) recordTree(file);
      else if (entry.isFile()) record(file);
      else throw new Error(`Unsupported fixture entry: ${file}`);
    }
  }
  record(path.join(here, "matrix.json"));
  record(fileURLToPath(import.meta.url));
  const root = path.resolve(here, "../..");
  for (const file of ["agents/worker.md", "agents/reviewer.md", "agents/scout.md", "docs/benchmark-prompts/parent.md"]) record(path.join(root, file));
  for (const workload of matrix.workloads) {
    const source = path.resolve(here, workload.sourceCase);
    const sourceDir = path.dirname(source);
    const original = readJson(source);
    const fixture = path.resolve(sourceDir, original.fixture);
    record(source);
    recordTree(fixture);
    record(path.join(sourceDir, "expectations.json"));
    record(path.resolve(sourceDir, "../evaluator.mjs"));
    record(path.resolve(sourceDir, "../checks.mjs"));
    for (const arm of matrix.arms) {
      const draft = structuredClone(original);
      const candidate = matrix.models[arm.worker];
      draft.id = `${workload.id}--${arm.id}`;
      delete draft.route;
      delete draft.currentPricing;
      draft.candidateRoute = structuredClone(workload.group === "orchestrated" ? matrix.models[matrix.fixedWorkflowRoles.parent].route : candidate.route);
      draft.fixture = slash(path.relative(path.join(output, "cases"), fixture));
      const relocatedSourceDir = slash(path.relative(path.join(output, "cases"), sourceDir));
      draft.evaluator.args = draft.evaluator.args.map(arg => arg.replaceAll("{caseDir}", `{caseDir}/${relocatedSourceDir}`));
      if (draft.workflow) {
        for (const child of draft.workflow.children) {
          const modelKey = child.role === "worker" ? arm.worker : matrix.fixedWorkflowRoles[child.role];
          if (!matrix.models[modelKey]) throw new Error(`No fixed candidate for ${child.role}`);
          delete child.route;
          delete child.currentPricing;
          child.candidateRoute = structuredClone(matrix.models[modelKey].route);
        }
      }
      prepared.push({ draft, workload, arm });
    }
  }
  // Build privately before publishing. No subprocess, provider, credentials,
  // settings, runtime resolution, evaluator execution or benchmark launch.
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "pi-gpt6-preparation-"));
  try {
    fs.mkdirSync(path.join(temporary, "cases"));
    for (const { draft } of prepared) writeJson(path.join(temporary, "cases", `${draft.id}.draft.json`), draft);
    writeJson(path.join(temporary, "manifest.json"), {
      schemaVersion: 1,
      id: matrix.id,
      launchAuthorized: false,
      status: matrix.status,
      matrix,
      cases: prepared.map(({ draft, workload, arm }) => ({
        id: draft.id, group: workload.group, stage: workload.stage, arm: arm.id,
        file: `cases/${draft.id}.draft.json`,
        sha256: sha256(fs.readFileSync(path.join(temporary, "cases", `${draft.id}.draft.json`))),
      })),
      sources: [...sources].sort(([a], [b]) => a.localeCompare(b)).map(([file, hash]) => ({ path: slash(path.relative(output, file)), sha256: hash })),
      blockers: [
        "Separate paid-run/spend approval required; preparation grants none.",
        "Resolve prior unknown campaign spend/reservation policy explicitly; a new directory is not a budget reset.",
        "Verify actual runtime model IDs, medium effort mapping, Codex availability and raw usage provenance.",
        "Reverify dated pricing, cache-write counters and supported processing/context tier before promotion.",
        "Use workflow-arm-aware aggregation and one cumulative ledger; stock plan grouping ignores child Routes.",
        "Drafts omit route/currentPricing intentionally; no executable plans emitted.",
      ],
    });
    // Exclusive destination creation prevents accidental overwrite of existing work.
    fs.mkdirSync(output, { recursive: false });
    try {
      fs.cpSync(temporary, output, { recursive: true, force: false, errorOnExist: true });
    } catch (error) {
      fs.rmSync(output, { recursive: true, force: true });
      throw error;
    }
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
  return { output, cases: prepared.length, launchAuthorized: false };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw new Error("Usage: node benchmarks/gpt6-comparison/prepare.mjs NEW_OUTPUT_DIRECTORY");
  console.log(JSON.stringify(prepareComparison(process.argv[2]), null, 2));
}
