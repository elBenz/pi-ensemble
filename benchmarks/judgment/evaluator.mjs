import fs from "node:fs";
import path from "node:path";
import { checkBehavior } from "./checks.mjs";
import { isDeepStrictEqual } from "node:util";
const input = JSON.parse(fs.readFileSync(process.env.PI_BENCHMARK_EVALUATOR_INPUT, "utf8"));
const expected = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const checks = {};
const exactKeys = (value, keys) => Boolean(value && typeof value === "object" && !Array.isArray(value) && isDeepStrictEqual(Object.keys(value).sort(), [...keys].sort()));
try {
	const answer = JSON.parse(input.candidateOutput);
	if (expected.kind === "oracle") {
		const facts = fs.readFileSync(path.join(input.workspace, "facts.md"), "utf8");
		const supported = (entry, reference) => typeof entry?.quote === "string" && entry.quote.length <= 500 && entry.quote.includes(reference.anchor) && facts.includes(entry.quote);
		checks.contract = exactKeys(answer, ["authority", "lineage", "tradeoffs", "drift", "recommendation"]);
		for (const [dimension, reference] of Object.entries(expected.decisions)) {
			const entry = answer[dimension];
			checks[dimension] = exactKeys(entry, reference.certainty ? ["decision", "certainty", "quote"] : ["decision", "quote"])
				&& entry.decision === reference.decision && (!reference.certainty || entry.certainty === reference.certainty) && supported(entry, reference);
		}
		checks.tradeoffs = Array.isArray(answer.tradeoffs) && answer.tradeoffs.length === expected.tradeoffs.length && expected.tradeoffs.every(reference => answer.tradeoffs.some(entry => exactKeys(entry, ["option", "benefit", "risk", "quote"]) && ["option", "benefit", "risk"].every(k => entry[k] === reference[k]) && supported(entry, reference)));
	} else if (expected.kind === "parent") {
		const w = input.workflow;
		checks.contract = exactKeys(answer, ["action", "certainty", "accepted"]) && answer.action === "finish" && answer.certainty === "verified" && answer.accepted === true;
		checks.workflow = w?.passed === true;
		checks.roleSelection = w?.children.length === 2 && w.children[0].role === "worker" && w.children[1].role === "reviewer";
		checks.reviewedIntegration = checks.roleSelection && w.children[1].before["task.mjs"] === w.verifications.at(-1)?.snapshot["task.mjs"];
		let review;
		try { review = JSON.parse(w.children.at(-1)?.metrics.candidateOutput); } catch {}
		checks.childFindings = exactKeys(review, ["findings"]) && Array.isArray(review.findings) && review.findings.length === 0;
		checks.boundedContracts = checks.roleSelection && isDeepStrictEqual(w.children[0].changedFiles, ["proposed.mjs"]) && w.children[1].changedFiles.length === 0;
		const baseline = path.resolve(path.dirname(process.argv[2]), expected.fixture);
		const files = fs.readdirSync(input.workspace).sort();
		checks.scope = isDeepStrictEqual(files, ["TASK.md", "acceptance.mjs", "proposed.mjs", "task.mjs"].sort()) && ["TASK.md", "acceptance.mjs"].every(f => fs.lstatSync(path.join(input.workspace, f)).isFile() && fs.readFileSync(path.join(input.workspace, f), "utf8") === fs.readFileSync(path.join(baseline, f), "utf8"));
		checks.integration = fs.lstatSync(path.join(input.workspace, "task.mjs")).isFile() && fs.lstatSync(path.join(input.workspace, "proposed.mjs")).isFile() && fs.readFileSync(path.join(input.workspace, "task.mjs"), "utf8") === fs.readFileSync(path.join(input.workspace, "proposed.mjs"), "utf8");
		checks.behavior = false;
		await checkBehavior(expected.behavior, input.workspace);
		checks.behavior = true;
	} else throw new Error("Unknown rubric");
} catch (error) { checks.invalid = false; checks.error = String(error); }
const scores = Object.values(checks).filter(v => typeof v === "boolean");
const passed = scores.length > 0 && scores.every(Boolean);
console.log(JSON.stringify({ passed, score: scores.filter(Boolean).length / scores.length, checks }));
process.exitCode = passed ? 0 : 1;
