import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { changedPaths } from "../support/delegate-checks.mjs";
import { checkBehavior } from "./checks.mjs";

const input = JSON.parse(fs.readFileSync(process.env.PI_BENCHMARK_EVALUATOR_INPUT, "utf8"));
const expected = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const fixture = path.resolve(path.dirname(process.argv[2]), expected.fixture);
const checks = expected.role === "worker"
	? { contract: false, isolation: false, focusedTests: false, regressions: false }
	: { contract: false, recall: false, severity: false, evidence: false, actionableRepair: false, noFalsePositives: false, ...(expected.role === "watchdog" ? { completionJudgment: false } : {}) };
function keys(value, names) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		&& isDeepStrictEqual(Object.keys(value).sort(), [...names].sort());
}
function focusedTests(workspace) {
	const result = spawnSync(process.execPath, ["--test", "focused.test.mjs"], { cwd: workspace, encoding: "utf8", timeout: 3000 });
	return result.status === 0;
}
let scratch;
try {
	const answer = JSON.parse(input.candidateOutput);
	if (expected.role === "worker") {
		checks.contract = keys(answer, ["changedFiles", "summary"]) && isDeepStrictEqual(answer.changedFiles, [expected.target])
			&& typeof answer.summary === "string" && answer.summary.trim().length > 0;
		checks.isolation = isDeepStrictEqual(changedPaths(fixture, input.workspace), [expected.target]);
		checks.focusedTests = focusedTests(input.workspace);
		await checkBehavior(expected.behavior, input.workspace);
		checks.regressions = true;
	} else {
		const names = expected.role === "watchdog" ? ["findings", "decision"] : ["findings"];
		checks.contract = keys(answer, names) && Array.isArray(answer.findings) && answer.findings.every((finding) =>
			keys(finding, ["path", "startLine", "endLine", "quote", "severity", "explanation", "repair"])
			&& typeof finding.explanation === "string" && finding.explanation.trim().length > 0
			&& keys(finding.repair, ["oldText", "newText"])
			&& typeof finding.repair.oldText === "string" && typeof finding.repair.newText === "string");
		if (expected.role === "watchdog") checks.completionJudgment = answer.decision === expected.decision;
		const findings = checks.contract ? answer.findings : [];
		const source = fs.readFileSync(path.join(fixture, expected.target), "utf8");
		// Each target is a single narrow defective behavior. Accept alternate source
		// evidence; executable repair checks below establish defect correctness.
		const matches = (finding) => finding.path === expected.target && typeof finding.quote === "string"
			&& finding.quote.trim().length > 0 && source.includes(finding.quote);
		const detected = expected.defect ? findings.filter(matches) : [];
		checks.recall = !expected.defect || detected.length > 0;
		checks.noFalsePositives = findings.length === (expected.defect ? 1 : 0) && (!expected.defect || detected.length === 1);
		checks.severity = !expected.defect || detected.some((finding) => finding.severity === expected.severity);
		checks.evidence = !expected.defect || detected.some((finding) => {
			const lines = source.split(/\r?\n/);
			return Number.isSafeInteger(finding.startLine) && Number.isSafeInteger(finding.endLine)
				&& finding.startLine >= 1 && finding.endLine >= finding.startLine && finding.endLine <= lines.length
				&& finding.quote.length <= 500 && lines.slice(finding.startLine - 1, finding.endLine).join("\n").includes(finding.quote);
		});
		// Suggested repairs remain advisory: apply only host-side, after candidate exits.
		// Hidden behavioral probes validate generalization, not prose or an exact patch.
		scratch = fs.mkdtempSync(path.join(path.dirname(process.env.PI_BENCHMARK_EVALUATOR_INPUT), "review-scratch-"));
		fs.cpSync(fixture, scratch, { recursive: true });
		if (expected.defect && detected.length === 1) {
			const { oldText, newText } = detected[0].repair;
			if (!oldText || oldText === newText || source.split(oldText).length !== 2) throw new Error("Repair must replace one unique source span");
			fs.writeFileSync(path.join(scratch, expected.target), source.replace(oldText, () => newText));
		} else if (expected.defect) throw new Error("Missing unique seeded defect");
		if (!focusedTests(scratch)) throw new Error("Suggested repair fails focused tests");
		await checkBehavior(expected.behavior, scratch);
		checks.actionableRepair = true;
	}
} catch (error) {
	checks.error = error instanceof Error ? error.message : String(error);
} finally {
	if (scratch) fs.rmSync(scratch, { recursive: true, force: true });
}
const dimensions = Object.values(checks).filter((value) => typeof value === "boolean");
const passed = dimensions.every(Boolean);
process.stdout.write(JSON.stringify({ schemaVersion: 1, role: expected.role, passed, score: dimensions.filter(Boolean).length / dimensions.length, checks }));
process.exitCode = passed ? 0 : 1;
