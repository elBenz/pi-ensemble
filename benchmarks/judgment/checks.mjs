import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";
export async function checkBehavior(kind, workspace) {
	const mod = await import(pathToFileURL(path.join(workspace, "task.mjs")));
	if (kind === "deadline") {
		assert.equal(mod.remaining(20, 10, 0), 0);
		assert.equal(mod.remaining(20, 10, 7), 7);
		assert.equal(mod.remaining(undefined, 10), undefined);
		assert.equal(mod.remaining(null, 10), undefined);
		assert.equal(mod.remaining(20, 30), 1);
		assert.equal(mod.remaining(20, 10), 10);
	} else if (kind === "queue") {
		assert.equal(mod.slots(3, 1), 2);
		assert.equal(mod.slots(3, 5), 0);
		assert.equal(mod.slots(1, 0), 1);
		for (const [limit, active] of [[0, 0], [2.5, 1], [3, -1], [3, 0.5], [NaN, 0], [3, Infinity]]) assert.throws(() => mod.slots(limit, active), TypeError);
	} else if (kind === "attempts") {
		const rows = Object.freeze([Object.freeze({attempt:5,state:"completed",artifact:"five"}), Object.freeze({attempt:8,state:"running",artifact:"eight"}), Object.freeze({attempt:2,state:"completed",artifact:"two"})]);
		assert.equal(mod.latest(rows), "five");
		assert.equal(mod.latest([]), undefined);
		assert.equal(mod.latest([{attempt:9,state:"failed",artifact:"bad"}]), undefined);
	} else throw new Error("Unknown behavior");
}
