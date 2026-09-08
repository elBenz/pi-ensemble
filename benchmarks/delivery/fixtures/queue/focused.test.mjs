import assert from "node:assert/strict";
import { test } from "node:test";
import { createQueue } from "./queue.mjs";
test("task results propagate", async () => {
  assert.equal(await createQueue().run("a", () => 42), 42);
});
test("independent keys both finish", async () => {
  const queue = createQueue();
  assert.deepEqual(await Promise.all([queue.run("a", () => 1), queue.run("b", () => 2)]), [1, 2]);
});
