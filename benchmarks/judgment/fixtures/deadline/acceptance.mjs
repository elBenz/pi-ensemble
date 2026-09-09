import assert from "node:assert/strict";
import { remaining } from "./task.mjs";
assert.equal(remaining(20, 10, 0), 0);
assert.equal(remaining(20, 10), 10);
