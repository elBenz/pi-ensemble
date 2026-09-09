import * as fs from "node:fs";
import * as path from "node:path";
import { classifySpend, summarizeRouteContext, type BenchmarkStage } from "./policy.ts";
import { parseBenchmarkCase, runBenchmarkCase } from "./runner.ts";

export interface BenchmarkPlan {
	id: string;
	stage: BenchmarkStage;
	launches: Array<{ casePath: string; repetition: number }>;
}

export interface RunBenchmarkPlanOptions {
	planPath: string;
	outputDir: string;
	env?: NodeJS.ProcessEnv;
	onWarning?: (message: string) => void;
}

export interface BenchmarkPlanResult {
	passed: boolean;
	blocked: boolean;
	outputDir: string;
	receiptPath: string;
	resultPath: string;
	reportPath: string;
}

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
	return value;
}

export function parseBenchmarkPlan(value: unknown, planDir: string): BenchmarkPlan {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Benchmark plan must be an object.");
	const input = value as Record<string, unknown>;
	if (input.stage !== "screening" && input.stage !== "finalist") throw new Error("stage must be screening or finalist.");
	if (input.initialSpend !== undefined) throw new Error("initialSpend is not supported; one plan must contain the complete stage so spend remains auditable.");
	if (!Array.isArray(input.launches) || input.launches.length === 0) throw new Error("launches must be a non-empty array.");
	const launches: BenchmarkPlan["launches"] = [];
	for (const [index, launch] of input.launches.entries()) {
		if (!launch || typeof launch !== "object" || Array.isArray(launch)) throw new Error(`launches[${index}] must be an object.`);
		const record = launch as Record<string, unknown>;
		const repetitions = record.repetitions === undefined ? 1 : record.repetitions;
		if (typeof repetitions !== "number" || !Number.isSafeInteger(repetitions) || repetitions <= 0) throw new Error(`launches[${index}].repetitions must be a positive integer.`);
		const casePath = path.resolve(planDir, requiredString(record.case, `launches[${index}].case`));
		for (let repetition = 1; repetition <= repetitions; repetition += 1) launches.push({ casePath, repetition });
	}
	return { id: requiredString(input.id, "id"), stage: input.stage, launches };
}

function writeImmutableJson(filePath: string, value: object): void {
	const descriptor = fs.openSync(filePath, "wx", 0o444);
	try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); } finally { fs.closeSync(descriptor); }
	fs.chmodSync(filePath, 0o444);
}

function routeKey(result: Record<string, unknown>): string {
	const route = result.route as Record<string, unknown>;
	return [result.agentRole, route.modelTier, route.model, route.thinkingLevel].join("\u0000");
}

function reportMarkdown(plan: BenchmarkPlan, result: Record<string, unknown>): string {
	const budget = result.budget as Record<string, unknown>;
	const routes = result.routes as Array<Record<string, unknown>>;
	const routeLines = routes.map((route) => `- ${route.agentRole}: ${route.modelTier} (${route.model}; Thinking level ${route.thinkingLevel}) — ${route.runs}/${route.expectedRuns} runs, typical ${route.typicalPeakContextLoad ?? "n/a"}, ${!route.contextComplete ? "context unknown" : route.eligible ? "eligible" : "ineligible"}, ${route.tailBreaches} Tail breach(es)${route.finalistAccepted === null ? "" : `, finalist ${route.finalistAccepted ? "accepted" : "rejected"}`}`).join("\n");
	return `# Benchmark plan: ${plan.id}\n\n**${result.passed ? "PASS" : "INCOMPLETE/FAIL"}**\n\n- Stage: ${plan.stage}\n- Launches completed: ${result.completedLaunches}/${plan.launches.length}\n- Cumulative Benchmark cost: ${budget.complete ? `$${Number(budget.cumulativeSpend).toFixed(6)}` : `unavailable; known spend $${Number(budget.knownSpend).toFixed(6)} (${budget.unavailableReason})`}\n- Spend warning: ${budget.warning ? "yes" : "no"}\n- Hard stop: ${budget.blocked ? "yes" : "no"}\n\n## Routes\n\n${routeLines || "No completed Routes."}\n`;
}

export async function runBenchmarkPlan(options: RunBenchmarkPlanOptions): Promise<BenchmarkPlanResult> {
	const planPath = path.resolve(options.planPath);
	const outputDir = path.resolve(options.outputDir);
	if (fs.existsSync(outputDir)) throw new Error(`Output directory already exists: ${outputDir}`);
	const plan = parseBenchmarkPlan(JSON.parse(fs.readFileSync(planPath, "utf-8")), path.dirname(planPath));
	const cases = plan.launches.map((launch) => parseBenchmarkCase(JSON.parse(fs.readFileSync(launch.casePath, "utf-8"))));
	for (const [index, benchmarkCase] of cases.entries()) {
		if (!benchmarkCase.currentPricing) throw new Error(`launches[${index}] case lacks currentPricing required for spend enforcement.`);
	}
	fs.mkdirSync(outputDir, { recursive: true });
	let cumulativeSpend = 0;
	let unavailableReason: string | null = null;
	const decisions: Array<Record<string, unknown>> = [];
	const completed: Array<Record<string, unknown>> = [];
	let warned = false;
	let blocked = false;

	for (const [index, launch] of plan.launches.entries()) {
		const spend = classifySpend(plan.stage, cumulativeSpend);
		if (spend.warning && !warned) {
			warned = true;
			options.onWarning?.(`${plan.stage} Benchmark spend reached $${spend.warningLimit}; cumulative $${cumulativeSpend.toFixed(6)}.`);
		}
		if (spend.blocked || unavailableReason !== null) {
			blocked = true;
			for (let blockedIndex = index; blockedIndex < plan.launches.length; blockedIndex += 1) {
				const blockedLaunch = plan.launches[blockedIndex]!;
				decisions.push({ index: blockedIndex, action: "blocked", cumulativeSpend: unavailableReason === null ? cumulativeSpend : null, knownSpend: cumulativeSpend, reason: unavailableReason === null ? "Hard spend limit reached." : `Benchmark cost unavailable: ${unavailableReason}`, hardLimit: spend.hardLimit, casePath: blockedLaunch.casePath, repetition: blockedLaunch.repetition });
			}
			break;
		}
		const runOutputDir = path.join(outputDir, `run-${String(index + 1).padStart(3, "0")}`);
		const run = await runBenchmarkCase({ casePath: launch.casePath, outputDir: runOutputDir, env: options.env, launchBudgetUsd: spend.hardLimit - cumulativeSpend });
		const normalized = JSON.parse(fs.readFileSync(run.resultPath, "utf-8")) as Record<string, unknown>;
		const benchmarkCost = normalized.benchmarkCost as { amount: number } | null;
		const before = cumulativeSpend;
		if (benchmarkCost && Number.isFinite(benchmarkCost.amount) && benchmarkCost.amount >= 0 && Number.isFinite(cumulativeSpend + benchmarkCost.amount)) cumulativeSpend += benchmarkCost.amount;
		else unavailableReason = String(normalized.benchmarkCostUnavailableReason ?? "Invalid or overflowing Benchmark cost.");
		decisions.push({ index, action: "launched", cumulativeSpendBefore: before, cumulativeSpendAfter: unavailableReason === null ? cumulativeSpend : null, knownSpend: cumulativeSpend, costUnavailableReason: unavailableReason, casePath: launch.casePath, repetition: launch.repetition, receiptPath: run.receiptPath, resultPath: run.resultPath });
		completed.push(normalized);
	}

	const grouped = new Map<string, Record<string, unknown>[] >();
	for (const run of completed) {
		const key = routeKey(run);
		const group = grouped.get(key) ?? [];
		group.push(run);
		grouped.set(key, group);
	}
	const routes = [...grouped.values()].map((runs) => {
		const first = runs[0]!;
		const route = first.route as Record<string, unknown>;
		const peaks = runs.map((run) => (run.metrics as { peakContextLoad: number | null }).peakContextLoad);
		const knownPeaks = peaks.filter((peak): peak is number => peak !== null && Number.isFinite(peak) && peak >= 0);
		const contextComplete = knownPeaks.length === peaks.length;
		const context = summarizeRouteContext(knownPeaks, plan.stage);
		const expectedRuns = plan.stage === "screening" ? 3 : 9;
		return { agentRole: first.agentRole, ...route, runs: runs.length, expectedRuns, complete: runs.length === expectedRuns, ...context,
			tailBreaches: runs.filter((run) => (run.contextPolicy as { tailBreach: boolean | null }).tailBreach === true).length,
			contextComplete,
			...(contextComplete ? {} : { typicalPeakContextLoad: null, eligible: false, finalistAccepted: null }),
		};
	});
	const finalSpend = classifySpend(plan.stage, cumulativeSpend);
	if (finalSpend.warning && !warned) {
		warned = true;
		options.onWarning?.(`${plan.stage} Benchmark spend reached $${finalSpend.warningLimit}; cumulative $${cumulativeSpend.toFixed(6)}.`);
	}
	const passed = !blocked && unavailableReason === null
		&& completed.every((run) => run.passed === true)
		&& routes.every((route) => route.complete && route.eligible && (plan.stage !== "finalist" || route.finalistAccepted === true));
	const result = {
		schemaVersion: 2,
		planId: plan.id,
		stage: plan.stage,
		passed,
		completedLaunches: completed.length,
		routes,
		budget: { cumulativeSpend: unavailableReason === null ? cumulativeSpend : null, knownSpend: cumulativeSpend, complete: unavailableReason === null, unavailableReason, warning: warned, blocked, warningLimit: finalSpend.warningLimit, hardLimit: finalSpend.hardLimit },
	};
	const receiptPath = path.join(outputDir, "receipt.json");
	const resultPath = path.join(outputDir, "result.json");
	const reportPath = path.join(outputDir, "report.md");
	writeImmutableJson(receiptPath, { schemaVersion: 1, plan, decisions });
	fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
	fs.writeFileSync(reportPath, reportMarkdown(plan, result), "utf-8");
	return { passed, blocked, outputDir, receiptPath, resultPath, reportPath };
}
