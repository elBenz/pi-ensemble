import assert from "node:assert/strict";
import { slots } from "./task.mjs";
assert.equal(slots(3, 5), 0);
assert.equal(slots(3, 1), 2);
