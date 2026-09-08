import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

function snapshot(root) {
	const entries = {};
	function visit(dir) {
		for (const name of fs.readdirSync(dir).sort()) {
			const full = path.join(dir, name);
			const relative = path.relative(root, full).split(path.sep).join("/");
			const stat = fs.lstatSync(full);
			if (stat.isDirectory()) { entries[relative] = "directory"; visit(full); }
			else if (stat.isFile()) entries[relative] = createHash("sha256").update(fs.readFileSync(full)).digest("hex");
			else throw new Error(`Non-regular entry: ${relative}`);
		}
	}
	visit(root);
	return entries;
}

export function changedPaths(fixture, workspace) {
	const before = snapshot(fixture);
	const after = snapshot(workspace);
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => before[key] !== after[key]).sort();
}

export async function checkDelegateBehavior(behavior, workspace) {
	if (behavior === "extract") return; // Read-only result correctness is checked by the host rubric.
	if (behavior === "tags") {
		const { normalizeTags } = await import(pathToFileURL(path.join(workspace, "tags.mjs")));
		const original = Object.freeze(["  Alpha ", "alpha", "", " BETA\t", "beta", "Gamma"]);
		assert.deepEqual(normalizeTags(original), ["alpha", "beta", "gamma"]);
		assert.deepEqual(normalizeTags([]), []);
		assert.deepEqual(normalizeTags([" __proto__ ", "constructor", "__proto__"]), ["__proto__", "constructor"]);
		for (const invalid of [null, undefined, "abc", {}, [1], ["valid", null], [false], [{ trim: () => "pretend" }]]) {
			assert.throws(() => normalizeTags(invalid), TypeError);
		}
		return;
	}
	if (behavior !== "rename") throw new Error(`Unknown delegate behavior: ${behavior}`);
	const { createAtomicJsonWriter } = await import(pathToFileURL(path.join(workspace, "src/shared/atomic-json.ts")));
	function scenario({ code, failures, options = {}, error = false, useDefault = false }) {
		let attempts = 0;
		const waits = [];
		const events = [];
		const target = path.join("results", "out.json");
		const temp = path.join("results", ".out.json.1.2.i.tmp");
		const files = new Map();
		const payload = { done: true };
		const failure = Object.assign(new Error("rename failed"), { code });
		const writer = createAtomicJsonWriter({
			fs: {
				mkdirSync(dir, config) {
					assert.equal(dir, path.dirname(target));
					assert.deepEqual(config, { recursive: true });
					events.push("mkdir");
				},
				writeFileSync(file, text, encoding) {
					assert.deepEqual(events, ["mkdir"]);
					assert.equal(file, temp);
					assert.equal(encoding, "utf-8");
					assert.deepEqual(JSON.parse(text), payload);
					files.set(file, text);
					events.push("write");
				},
				renameSync(from, to) {
					assert.equal(from, temp);
					assert.equal(to, target);
					assert.ok(files.has(from), "Rename requires previously written temporary file");
					events.push("rename");
					if (++attempts <= failures) throw failure;
					files.set(to, files.get(from));
					files.delete(from);
				},
				rmSync(file, config) {
					assert.equal(file, temp, "Cleanup must not remove destination");
					assert.deepEqual(config, { force: true });
					files.delete(file);
					events.push("cleanup");
				},
			},
			now: () => 2, pid: 1, random: () => 0.5,
			wait: (delay) => waits.push(delay), ...(useDefault ? {} : { retryRenameErrors: true }), ...options,
		});
		if (error) assert.throws(() => writer(target, payload), (value) => value === failure);
		else writer(target, payload);
		assert.deepEqual(events.slice(0, 2), ["mkdir", "write"]);
		assert.equal(events.filter((event) => event === "cleanup").length, 1);
		assert.equal(events.at(-1), "cleanup");
		assert.equal(files.has(temp), false);
		if (error) assert.equal(files.has(target), false);
		else assert.deepEqual(JSON.parse(files.get(target)), payload);
		return { attempts, waits };
	}
	for (const code of ["EACCES", "EBUSY", "EPERM"]) {
		assert.deepEqual(scenario({ code, failures: 9 }), { attempts: 10, waits: [10, 25, 50, 100, 200, 500, 1000, 2000, 4000] });
	}
	assert.deepEqual(scenario({ code: "EPERM", failures: 20, error: true }), { attempts: 10, waits: [10, 25, 50, 100, 200, 500, 1000, 2000, 4000] });
	assert.deepEqual(scenario({ code: "ENOENT", failures: 1, error: true }), { attempts: 1, waits: [] });
	assert.deepEqual(scenario({ code: "EPERM", failures: 1, options: { retryRenameErrors: false }, error: true }), { attempts: 1, waits: [] });
	assert.deepEqual(scenario({ code: "EBUSY", failures: 2, options: { retryDelaysMs: [1, 3] } }), { attempts: 3, waits: [1, 3] });
	assert.deepEqual(scenario({ code: "EPERM", failures: 1, options: { retryDelaysMs: [] }, error: true }), { attempts: 1, waits: [] });
	assert.deepEqual(scenario({ code: "EPERM", failures: 1, useDefault: true, error: process.platform !== "win32" }),
		process.platform === "win32" ? { attempts: 2, waits: [10] } : { attempts: 1, waits: [] });
}
