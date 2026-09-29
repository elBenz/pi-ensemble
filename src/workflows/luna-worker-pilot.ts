import { isAbsolute } from "node:path";
import type { AcceptanceVerifyCommand } from "../shared/types.ts";

export interface LunaWorkerPilotContract {
	cwd: string;
	goal: string;
	entryPoints: string[];
	invariants: string[];
	allowedFiles: string[];
	nonGoals: string[];
	clarificationConditions: string[];
	verify: AcceptanceVerifyCommand[];
}

/** Project opt-in recipe; no routing engine, model calls, or settings writes. */
export function buildLunaWorkerPilot(contract: LunaWorkerPilotContract) {
	if (!isAbsolute(contract.cwd)) throw new Error("Pilot cwd must be absolute.");
	if (!contract.goal?.trim()) throw new Error("Pilot goal is required.");
	for (const field of ["entryPoints", "invariants", "allowedFiles", "nonGoals", "clarificationConditions"] as const) {
		if (!Array.isArray(contract[field]) || !contract[field].length || contract[field].some(value => typeof value !== "string" || !value.trim())) {
			throw new Error(`Pilot ${field} must contain non-empty strings.`);
		}
	}
	if (!contract.verify?.length || contract.verify.some(check => !check.id?.trim() || !check.command?.trim() || check.allowFailure)) {
		throw new Error("Pilot requires host verification commands without allowed failures.");
	}
	const task = [
		`Goal / observable behavior: ${contract.goal}`,
		`Entry points (investigate implementation): ${contract.entryPoints.join(", ")}`,
		`Preserve invariants: ${contract.invariants.join("; ")}`,
		`Allowed files: ${contract.allowedFiles.join(", ")}`,
		`Non-goals: ${contract.nonGoals.join("; ")}`,
		`Clarification conditions: ${contract.clarificationConditions.join("; ")}`,
		`Acceptance commands: ${contract.verify.map(check => check.command).join("\n")}`,
		"Own investigation, implementation, tests and evidence. Sole writer in this cwd; preserve existing changes and artifacts. No commits, staging, resets or publication.",
		"Parent retains scope, architecture and operational authority. Ask parent about unresolved requirements; do not guess or widen scope.",
		"Host owns telemetry and budget decisions. Report available evidence; unavailable child access to host counters is not a reason to stop implementation.",
	].join("\n\n");
	const common = {
		agent: "worker", cwd: contract.cwd, context: "fresh", worktree: false,
		// Explicit suffix wins even when a custom worker pins high thinking.
		acceptance: {
			level: "verified", criteria: [contract.goal],
			evidence: ["changed-files", "tests-added", "commands-run", "residual-risks", "no-staged-files"],
			verify: contract.verify,
		},
	};
	return {
		async: true,
		context: "fresh" as const,
		cwd: contract.cwd,
		workflowScript: `
const startedAt = Date.now();
const common = ${JSON.stringify(common)};
const task = ${JSON.stringify(task)};
const attempts = [];
const verificationId = String(startedAt) + "-" + String(Math.random());
function policy(attempt) {
  // A fresh host check per attempt also covers untracked-only workspace changes.
  return { ...common.acceptance, verify: common.acceptance.verify.map(check => ({ ...check,
    env: { ...check.env, PI_ENSEMBLE_PILOT_VERIFICATION: verificationId + "-" + attempt } })) };
}
function accepted(child) {
  return child.ok && child.results?.length === 1 && child.results[0].acceptance?.evidenceStatus === "verified";
}
function repairable(child) {
  const result = child.results?.[0];
  const ledger = result?.acceptance;
  // Execution/provider/accounting failures are parent decisions, never quality retries.
  return !child.detached && child.results?.length === 1 && ledger?.status === "rejected"
    && result.modelAttempts?.at(-1)?.success === true
    && !result.interrupted && !result.timedOut && !result.stopped
    && !result.protocolError && !result.outputSaveError && !result.structuredOutputFailed
    && !result.turnBudgetExceeded && !result.toolBudgetBlocked
    && ledger.verifyRuns?.length === common.acceptance.verify.length
    && ledger.verifyRuns.every(check => (check.status === "passed" || check.status === "failed")
      && typeof check.exitCode === "number" && Number.isFinite(check.exitCode))
    && ledger.verifyRuns.some(check => check.status === "failed")
    // Only an explicit, evidenced quality shortfall may accompany a failed host command.
    && ledger.runtimeChecks?.filter(check => check.status === "failed").every(check => {
      if (!check.id.startsWith("criterion:")) return false;
      const criterion = ledger.childReport?.criteriaSatisfied?.find(item => item.id === check.id.slice("criterion:".length));
      return criterion?.status === "not-satisfied" && typeof criterion.evidence === "string" && !!criterion.evidence.trim();
    });
}
function receipt(status) {
  return { status, repairs: attempts.length - 1, elapsedMs: Date.now() - startedAt, attempts,
    telemetry: { source: "attempts[].results[].usage", completeness: "not-established",
      note: "Reported usage is retained, not audited total spend. Missing host counters are not an implementation failure. No dollar enforcement installed; parent owns accounting decisions." } };
}
// Singleton all collects failed child results; runs.run throws before quality inspection.
const [luna] = await runs.all([{ key: "luna-implementation", ...common, acceptance: policy("luna"), model: "openai-codex/gpt-6-luna:medium", task }]);
attempts.push(luna);
if (accepted(luna)) return receipt("review-ready");
if (!repairable(luna)) return receipt("parent-decision");
const [sol] = await runs.all([{ key: "sol-repair", ...common, acceptance: policy("sol"), model: "openai-codex/gpt-6-sol:medium",
  task: task + "\\n\\nOne bounded quality repair of existing Luna changes. Inspect current workspace/diff; preserve useful changes and evidence. Fresh session, not a replay or resume. Repair only concrete acceptance failures below. Return unresolved requirements to parent.\\n" + JSON.stringify({ output: luna.output, artifactPaths: luna.artifactPaths, acceptance: luna.results[0].acceptance }) }]);
attempts.push(sol);
return receipt(accepted(sol) ? "review-ready" : "parent-decision");
`,
	};
}
