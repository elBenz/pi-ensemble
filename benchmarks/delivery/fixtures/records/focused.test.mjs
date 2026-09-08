import assert from "node:assert/strict";
import { test } from "node:test";
import { completedArtifacts } from "./records.mjs";
test("only completed records yield artifacts", () => {
  assert.deepEqual(completedArtifacts([{ id: "a", state: "running" }, { id: "b", state: "completed", artifact: "out/b.json" }]), ["out/b.json"]);
});
test("non-array completion data is invalid", () => {
  assert.throws(() => completedArtifacts(null), TypeError);
});
