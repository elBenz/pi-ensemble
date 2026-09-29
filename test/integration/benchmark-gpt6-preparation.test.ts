import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, it } from "node:test";
import { prepareComparison } from "../../benchmarks/gpt6-comparison/prepare.mjs";
import { parseBenchmarkCase } from "../../src/benchmark/runner.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const digest = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gpt6-drafts-test-"));
  roots.push(root);
  const output = path.join(root, "prepared");
  const result = prepareComparison(output);
  return { root, output, result, manifest: readJson(path.join(output, "manifest.json")) };
}

it("prepares all comparison arms, keeps drafts unlaunchable, and refuses overwrite", () => {
  const { output, result, manifest } = setup();
  assert.equal(result.cases, 18);
  assert.equal(result.launchAuthorized, false);
  assert.equal(manifest.launchAuthorized, false);
  assert.equal(new Set(manifest.cases.map((entry: { id: string }) => entry.id)).size, 18);
  assert.equal(manifest.cases.filter((entry: { stage: string }) => entry.stage === "screening").length, 6);
  assert.equal(manifest.matrix.deferred.length, 3);
  for (const entry of manifest.cases) {
    const file = path.join(output, entry.file);
    const draft = readJson(file);
    assert.throws(() => parseBenchmarkCase(draft), /route/);
    assert.equal(draft.route, undefined);
    assert.equal(draft.currentPricing, undefined);
    assert.equal(digest(file), entry.sha256);
  }
  const before = fs.readFileSync(path.join(output, "manifest.json"), "utf8");
  assert.throws(() => prepareComparison(output), /already exists/);
  assert.equal(fs.readFileSync(path.join(output, "manifest.json"), "utf8"), before);
});

it("preserves original tasks, protected fixtures and evaluators across candidate Routes", () => {
  const { output, manifest } = setup();
  const matrixDir = path.resolve(import.meta.dirname, "../../benchmarks/gpt6-comparison");
  for (const workload of manifest.matrix.workloads) {
    const source = path.resolve(matrixDir, workload.sourceCase);
    const original = readJson(source);
    for (const arm of manifest.matrix.arms) {
      const caseDir = path.join(output, "cases");
      const draft = readJson(path.join(caseDir, `${workload.id}--${arm.id}.draft.json`));
      assert.equal(draft.prompt, original.prompt);
      assert.equal(draft.timeoutMs, original.timeoutMs);
      assert.equal(draft.mutationPolicy, original.mutationPolicy);
      assert.equal(path.resolve(caseDir, draft.fixture), path.resolve(path.dirname(source), original.fixture));
      assert.equal(draft.evaluator.command, original.evaluator.command);
      assert.equal(draft.evaluator.requireStructuredVerdict, original.evaluator.requireStructuredVerdict);
      const args = draft.evaluator.args.map((arg: string) => path.resolve(arg.replaceAll("{caseDir}", caseDir)));
      assert.deepEqual(args, original.evaluator.args.map((arg: string) => path.resolve(arg.replaceAll("{caseDir}", path.dirname(source)))));
      for (const file of args) assert.ok(fs.existsSync(file), file);
      const worker = manifest.matrix.models[arm.worker];
      assert.deepEqual(draft.candidateRoute, draft.workflow ? manifest.matrix.models.astra.route : worker.route);
      // Validate a promoted copy in memory only; never create a runnable artifact.
      draft.route = draft.candidateRoute;
      draft.currentPricing = (draft.workflow ? manifest.matrix.models.astra : worker).pricingReference;
      if (draft.workflow) {
        assert.deepEqual(draft.workflow.verification, original.workflow.verification);
        for (const [index, child] of draft.workflow.children.entries()) {
          assert.equal(child.route, undefined);
          assert.equal(child.prompt, original.workflow.children[index].prompt);
          assert.equal(child.mutationPolicy, original.workflow.children[index].mutationPolicy);
          const model = child.role === "worker" ? worker : manifest.matrix.models.astra;
          assert.deepEqual(child.candidateRoute, model.route);
          child.route = child.candidateRoute;
          child.currentPricing = model.pricingReference;
        }
      }
      assert.doesNotThrow(() => parseBenchmarkCase(draft));
    }
  }
  for (const source of manifest.sources) assert.equal(digest(path.resolve(output, source.path)), source.sha256);
});
