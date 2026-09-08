import assert from "node:assert/strict";
import { test } from "node:test";
import { execute } from "./boundary.mjs";
test("transient failure without side effects may fall back", async () => {
  assert.deepEqual(await execute(async () => ({ ok: false, retryable: true, mutationAttempted: false }), async () => ({ ok: true })), { ok: true });
});
test("successful primary does not fall back", async () => {
  assert.deepEqual(await execute(async () => ({ ok: true }), () => { throw new Error("unexpected replay"); }), { ok: true });
});
