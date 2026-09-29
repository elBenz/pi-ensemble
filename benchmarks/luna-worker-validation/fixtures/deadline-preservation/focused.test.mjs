import assert from "node:assert/strict";
import { test } from "node:test";
import { launchOptions } from "./deadline.mjs";
test("child inherits remaining workflow time", () => {
  assert.deepEqual(launchOptions({ task: "work" }, {}, 1500, 1000), { task: "work", timeoutMs: 500 });
});
test("explicit timeout remains authoritative", () => {
  assert.deepEqual(launchOptions({ timeoutMs: 90 }, {}, 1500, 1000), { timeoutMs: 90 });
});
