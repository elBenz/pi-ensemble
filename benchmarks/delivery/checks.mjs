import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Host-only probes. Every invocation imports a fresh isolated candidate tree.
export async function checkBehavior(behavior, workspace) {
	const module = await import(pathToFileURL(path.join(workspace, `${behavior}.mjs`)));
	if (behavior === "deadline") {
		const { launchOptions } = module;
		assert.deepEqual(launchOptions({ task: "work" }, {}, 1500, 1000), { task: "work", timeoutMs: 500 });
		assert.deepEqual(launchOptions({}, {}, 999, 1000), { timeoutMs: 1 });
		assert.deepEqual(launchOptions({}, {}, 0, 1000), { timeoutMs: 1 });
		assert.deepEqual(launchOptions({}, {}, undefined, 1000), {});
		assert.deepEqual(launchOptions({}, { defaultTimeoutMs: 70 }, 1500, 1000), { timeoutMs: 70 });
		for (const params of [{ timeoutMs: 0 }, { maxRuntimeMs: 0 }, { timeoutMs: 900 }, { maxRuntimeMs: 900 }]) {
			assert.deepEqual(launchOptions(Object.freeze(params), Object.freeze({ defaultTimeoutMs: 80 }), 1500, 1000), params);
		}
		assert.deepEqual(launchOptions(Object.freeze({ task: "keep", async: true }), Object.freeze({ defaultTimeoutMs: 0 }), 1500, 1000), { task: "keep", async: true, timeoutMs: 0 });
		return;
	}
	if (behavior === "index") {
		const { listRuns } = module;
		const fail = () => { throw new Error("Unbounded history scan or unexpected fallback"); };
		const rows = [{ id: "new", sessionId: "s" }, { id: "older", sessionId: "s" }];
		assert.deepEqual(listRuns({ exact: fail, scanAll: fail, recent: (sessionId, limit) => {
			assert.equal(sessionId, "s"); assert.equal(limit, 1); return rows.slice(0, limit);
		} }, { sessionId: "s", limit: 1 }), [rows[0]]);
		assert.deepEqual(listRuns({ exact: () => undefined, scanAll: fail, recent: fail }, { id: "missing-canonical", sessionId: "s" }), []);
		assert.deepEqual(listRuns({ exact: () => ({ id: "secret", sessionId: "other" }), scanAll: fail, recent: fail }, { id: "secret", sessionId: "s" }), []);
		assert.deepEqual(listRuns({ exact: fail, scanAll: fail, recent: (_, limit) => { assert.equal(limit, 20); return rows; } }, { sessionId: "s" }), rows);
		assert.deepEqual(listRuns({ exact: fail, scanAll: fail, recent: (_, limit) => { assert.equal(limit, 0); return []; } }, { sessionId: "s", limit: 0 }), []);
		return;
	}
	if (behavior === "guard") {
		const { shouldBlock } = module;
		for (const tools of [[], ["read", "grep"], ["edit"], ["read", "write"]]) {
			const canMutate = tools.includes("edit") || tools.includes("write");
			assert.equal(shouldBlock({ applyChanges: false, suggestedFix: true, tools, attemptedMutation: false }), false, "Issue drafting must not require edits");
			assert.equal(shouldBlock({ applyChanges: true, suggestedFix: false, tools, attemptedMutation: false }), canMutate, "Real implementation must still require mutation when capable");
			assert.equal(shouldBlock({ applyChanges: true, suggestedFix: true, tools, attemptedMutation: true }), false);
			assert.equal(shouldBlock({ applyChanges: false, suggestedFix: false, tools, attemptedMutation: false }), false);
		}
		return;
	}
	if (behavior === "boundary") {
		const { execute } = module;
		for (const result of [
			{ ok: false, retryable: true, mutationAttempted: true, error: "quota after write" },
			{ ok: false, retryable: false, mutationAttempted: false, error: "invalid task" },
			{ ok: true, retryable: true, mutationAttempted: false, artifact: "out.json" },
		]) {
			assert.equal(await execute(() => result, () => { throw new Error("Unsafe replay"); }), result);
		}
		let attempts = 0;
		const delivered = { ok: true, artifact: "fallback.json" };
		assert.equal(await execute(() => { attempts++; return { ok: false, retryable: true, mutationAttempted: false }; }, () => { attempts++; return delivered; }), delivered);
		assert.equal(attempts, 2);
		const failure = new Error("execution failed");
		await assert.rejects(() => execute(() => { throw failure; }, () => { throw new Error("Unexpected replay"); }), error => error === failure);
		await assert.rejects(() => execute(() => ({ ok: false, retryable: true, mutationAttempted: false }), () => Promise.reject(failure)), error => error === failure);
		return;
	}
	if (behavior === "records") {
		const { completedArtifacts } = module;
		const valid = Object.freeze([
			Object.freeze({ id: "a", state: "running", artifact: 99 }),
			Object.freeze({ id: "b", state: "completed", artifact: " out/b.json " }),
			Object.freeze({ id: "c", state: "completed", artifact: "out/c.json", extra: true }),
		]);
		assert.deepEqual(completedArtifacts(valid), [" out/b.json ", "out/c.json"]);
		assert.deepEqual(completedArtifacts([]), []);
		const completed = { id: "ok", state: "completed", artifact: "out.json" };
		for (const invalid of [null, undefined, {}, "[]", 7, [null], [false], [[]], [{ id: " ", state: "running" }],
			[{ id: "a", state: "failed" }], [{ id: 7, state: "running" }], [{ id: "a", state: "completed" }],
			[{ id: "a", state: "completed", artifact: "\t" }], [completed, { id: "", state: "running" }],
			[completed, { id: "a", state: "completed", artifact: { toString: () => "pretend" } }], new Array(2)]) {
			assert.throws(() => completedArtifacts(invalid), TypeError, "Malformed completion data must not be silently accepted");
		}
		return;
	}
	if (behavior === "queue") {
		const { createQueue } = module;
		const drain = async () => { for (let tick = 0; tick < 12; tick++) await Promise.resolve(); };
		const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
		for (const rejectFirst of [false, true]) {
			const queue = createQueue();
			const a = deferred(), b = deferred();
			const events = [];
			const failure = new Error("first failed");
			const first = queue.run("same", async () => { events.push("a:start"); await a.promise; events.push("a:end"); if (rejectFirst) throw failure; return "a"; });
			// Attach rejection observer immediately; errors must propagate, not become unhandled.
			const observedFirst = first.then(value => value, error => error);
			const second = queue.run("same", async () => { events.push("b:start"); await b.promise; events.push("b:end"); return "b"; });
			const other = queue.run("other", () => { events.push("other"); return "other"; });
			await drain();
			assert.deepEqual([...events].sort(), ["a:start", "other"], "Same-key writes overlapped or independent key was blocked");
			assert.equal(await other, "other");
			a.resolve();
			await drain();
			assert.deepEqual(events.filter(event => event !== "other"), ["a:start", "a:end", "b:start"]);
			assert.equal(await observedFirst, rejectFirst ? failure : "a");
			// Unseen schedule: enqueue after old owner's cleanup, while newer owner is active.
			const third = queue.run("same", () => { events.push("c:start"); return "c"; });
			await drain();
			assert.equal(events.includes("c:start"), false, "Old owner erased newer queue ownership");
			b.resolve();
			assert.deepEqual(await Promise.all([second, third]), ["b", "c"]);
			assert.deepEqual(events.slice(-2), ["b:end", "c:start"]);
			assert.equal(await queue.run("same", () => "after"), "after");
		}
		return;
	}
	throw new Error(`Unknown delivery behavior: ${behavior}`);
}
