import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldBlock } from "./guard.mjs";
test("implementation without mutation must not claim completion", () => {
  assert.equal(shouldBlock({ applyChanges: true, suggestedFix: false, tools: ["edit"], attemptedMutation: false }), true);
});
test("successful mutation clears guard", () => {
  assert.equal(shouldBlock({ applyChanges: true, suggestedFix: true, tools: ["edit"], attemptedMutation: true }), false);
});
