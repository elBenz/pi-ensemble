import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { changedPaths, checkDelegateBehavior } from "./delegate-checks.mjs";
import { parseHandoff } from "./handoff.mjs";

// Host-only rubric. Candidate sees the response contract, never this file or expectations.
const input = JSON.parse(fs.readFileSync(process.env.PI_BENCHMARK_EVALUATOR_INPUT, "utf8"));
const expected = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const dimensions = {
	scout: ["contract", "discovery", "relevance", "evidence"],
	researcher: ["contract", "correctness", "noUnsupportedClaims", "sourceScope", "evidence"],
	delegate: ["contract", "isolation", "regressions"],
};
const checks = Object.fromEntries((dimensions[expected.kind] ?? ["valid"]).map((name) => [name, false]));
function objectWithKeys(value, keys) {
	return value !== null && typeof value === "object" && !Array.isArray(value)
		&& Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function supportedQuote(actual, reference) {
	if (typeof actual.quote !== "string" || actual.quote.length > 500 || !actual.quote.includes(reference.anchor)) return false;
	const file = path.join(input.workspace, reference.path);
	if (!fs.lstatSync(file).isFile()) return false;
	const source = fs.readFileSync(file, "utf8");
	if (expected.kind !== "scout") return source.includes(actual.quote);
	const lines = source.split(/\r?\n/);
	return Number.isSafeInteger(actual.startLine) && Number.isSafeInteger(actual.endLine)
		&& actual.startLine >= 1 && actual.endLine >= actual.startLine && actual.endLine <= lines.length
		&& lines.slice(actual.startLine - 1, actual.endLine).join("\n").includes(actual.quote);
}

try {
	const answer = parseHandoff(input.candidateOutput, expected.kind, expected.title);
	if (expected.kind === "scout") {
		checks.contract = objectWithKeys(answer, ["discoveries"]) && Array.isArray(answer.discoveries)
			&& answer.discoveries.every((entry) => objectWithKeys(entry, ["path", "symbol", "quote", "startLine", "endLine"]));
		const entries = checks.contract ? answer.discoveries : [];
		checks.discovery = expected.discoveries.every((reference) => entries.some((entry) => entry.path === reference.path && entry.symbol === reference.symbol));
		checks.relevance = entries.length === expected.discoveries.length && entries.every((entry) => expected.discoveries.some((reference) => entry.path === reference.path && entry.symbol === reference.symbol));
		checks.evidence = expected.discoveries.every((reference) => entries.some((entry) => entry.path === reference.path && entry.symbol === reference.symbol && supportedQuote(entry, reference)));
	} else if (expected.kind === "researcher") {
		checks.contract = objectWithKeys(answer, ["claims"]) && Array.isArray(answer.claims)
			&& answer.claims.every((claim) => objectWithKeys(claim, ["id", "value", "citations"])
				&& Array.isArray(claim.citations) && claim.citations.length > 0
				&& claim.citations.every((citation) => objectWithKeys(citation, ["path", "url", "quote"])));
		const claims = Array.isArray(answer?.claims) ? answer.claims : [];
		checks.correctness = expected.claims.every((reference) => claims.some((claim) => claim?.id === reference.id && JSON.stringify(claim.value) === JSON.stringify(reference.value)));
		checks.noUnsupportedClaims = claims.length === expected.claims.length && claims.every((claim) => expected.claims.some((reference) => claim?.id === reference.id));
		checks.sourceScope = checks.contract && claims.every((claim) => claim.citations.every((citation) => expected.claims.some((reference) => reference.id === claim.id && citation.path === reference.path && citation.url === reference.url)));
		checks.evidence = checks.sourceScope && expected.claims.every((reference) => claims.some((claim) => claim.id === reference.id && claim.citations.every((citation) => supportedQuote(citation, reference))));
	} else if (expected.kind === "delegate") {
		checks.contract = objectWithKeys(answer, ["changedFiles", "result"]) && isDeepStrictEqual(answer.result, expected.result)
			&& isDeepStrictEqual(answer.changedFiles, expected.changedFiles);
		checks.isolation = isDeepStrictEqual(changedPaths(path.resolve(path.dirname(process.argv[2]), expected.fixture), input.workspace), expected.changedFiles);
		checks.regressions = false;
		await checkDelegateBehavior(expected.behavior, input.workspace);
		checks.regressions = true;
	} else {
		throw new Error(`Unknown support rubric: ${expected.kind}`);
	}
} catch (error) {
	checks.error = error instanceof Error ? error.message : String(error);
}
const decisions = Object.values(checks).filter((value) => typeof value === "boolean");
const passed = decisions.length > 0 && decisions.every(Boolean);
process.stdout.write(JSON.stringify({ schemaVersion: 1, role: expected.kind, passed, score: decisions.filter(Boolean).length / decisions.length, checks }));
process.exitCode = passed ? 0 : 1;
