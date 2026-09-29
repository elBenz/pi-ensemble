// Independently audit every parent/child raw turn; result totals alone are not evidence.
import { isDeepStrictEqual } from "node:util";
import { readProviderUsage } from "../../src/benchmark/provider-usage.ts";
import { calculateBenchmarkCost } from "../../src/benchmark/policy.ts";
export function receiptAccounting(receipt, result) {
	const keys = ["input", "output", "cacheRead", "cacheWrite"];
	const turns = []; const components = []; let amount = 0;
	function account(process, spec, resolved) {
		if (resolved?.complete !== true || resolved.model !== spec.route.model || resolved.thinkingLevel !== spec.route.thinkingLevel) throw new Error("Raw Route mismatch");
		if (typeof process?.stdout !== "string") throw new Error("Missing raw usage process");
		const before = amount;
		let unfinished = false, count = 0, last;
		for (const line of process.stdout.split(/\r?\n/).filter(s => s.trim())) {
			const event = JSON.parse(line), message = event.message;
			if (["compaction_start", "compaction_end", "auto_compaction_start", "auto_compaction_end"].includes(event.type)) throw new Error("Unaccounted compaction usage");
			if (event.type === "message_update" || (event.type === "message_start" && message?.role === "assistant")) unfinished = true;
			if (event.type !== "message_end" || message?.role !== "assistant") continue;
			unfinished = false; count++; last = message;
			if (["error", "aborted"].includes(message.stopReason)) throw new Error("Incomplete terminal usage");
			if (message.provider !== spec.route.model.split("/")[0] || message.model !== spec.route.model.split("/").slice(1).join("/")) throw new Error("Terminal Route mismatch");
			const { usage, issue } = readProviderUsage(message);
			if (issue || keys.some(k => typeof usage[k] !== "number" || !Number.isFinite(usage[k]) || usage[k] < 0)) throw new Error("Missing/invalid raw usage provenance");
			const counters = Object.fromEntries(keys.map(k => [k, usage[k]]));
			const total = keys.reduce((sum, k) => sum + usage[k], 0);
			if (usage.input + usage.cacheRead + usage.cacheWrite > 272000 || (usage.totalTokens !== undefined && usage.totalTokens !== total)) throw new Error("Unsupported raw usage/pricing");
			turns.push({ turn: turns.length + 1, contextLoad: total, ...counters });
			amount += calculateBenchmarkCost(counters, spec.currentPricing).amount;
		}
		if (unfinished || !count) throw new Error("Incomplete raw usage");
		components.push({ role: spec.agentRole ?? spec.role ?? "parent", model: spec.route.model, amount: amount - before, durationMs: Number.isFinite(Date.parse(process.endedAt) - Date.parse(process.startedAt)) ? Date.parse(process.endedAt) - Date.parse(process.startedAt) : null, transportFailure: process.exitCode !== 0 || process.timedOut === true });
		return last;
	}
	if (receipt.case.workflow) {
		if (!Array.isArray(receipt.workflow?.parents) || !receipt.workflow.parents.length || !Array.isArray(receipt.workflow.children)) throw new Error("Missing workflow usage");
		let childIndex = 0;
		for (const [index, parent] of receipt.workflow.parents.entries()) {
			const last = account(parent.process, receipt.case, parent.resolved);
			// Runner charges parent before parsing its action or gating a child.
			// A terminal rejected action has no child process to account for. Raw
			// per-turn and cost reconciliation below still detects omitted processes.
			const rejectedTerminal = index === receipt.workflow.parents.length - 1
				&& childIndex === receipt.workflow.children.length
				&& receipt.workflow.passed === false && receipt.workflow.failures?.length > 0;
			let action;
			try { action = JSON.parse(last.content.filter(p => p.type === "text").map(p => p.text).join("\n")); }
			catch { if (rejectedTerminal) continue; throw new Error("Unknown workflow usage order"); }
			if (action?.action === "delegate") {
				const child = receipt.workflow.children[childIndex];
				if (!child && rejectedTerminal) continue;
				const spec = receipt.case.workflow.children.find(c => c.role === action.role);
				if (!spec || child?.role !== action.role) throw new Error("Missing/mismatched child usage");
				account(child.process, spec, child.resolved);
				childIndex++;
			}
		}
		if (childIndex !== receipt.workflow.children.length || receipt.candidate?.stdout !== receipt.workflow.parents.map(p => p.process.stdout).join("\n")) throw new Error("Workflow raw usage mismatch");
	} else {
		if (receipt.workflow) throw new Error("Unexpected workflow usage");
		account(receipt.candidate, receipt.case, receipt.resolved);
	}
	if (!Number.isFinite(amount) || typeof result.benchmarkCost?.amount !== "number" || Math.abs(amount - result.benchmarkCost.amount) > 1e-12 || !isDeepStrictEqual(turns, result.metrics?.perTurn)) throw new Error("Raw accounting amount/per-turn usage mismatch");
	return { amount, turns, components };
}
