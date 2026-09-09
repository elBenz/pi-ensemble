import assert from "node:assert/strict";
import { latest } from "./task.mjs";
assert.equal(latest([{attempt:2,state:"completed",artifact:"ok"},{attempt:3,state:"failed",artifact:"bad"}]), "ok");
