import assert from "node:assert/strict";
import { test } from "node:test";
import { listRuns } from "./index.mjs";
test("exact lookup returns matching session", () => {
  assert.deepEqual(listRuns({ exact: id => ({ id, sessionId: "s" }) }, { id: "r1", sessionId: "s" }), [{ id: "r1", sessionId: "s" }]);
});
test("recent query returns bounded results", () => {
  const runs = [{ id: "r2", sessionId: "s" }, { id: "r1", sessionId: "s" }];
  assert.deepEqual(listRuns({ scanAll: () => runs, recent: () => runs.slice(0, 1) }, { sessionId: "s", limit: 1 }), [runs[0]]);
});
