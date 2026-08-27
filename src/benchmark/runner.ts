import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { getPiSpawnCommand } from "../runs/shared/pi-spawn.ts";
import { THINKING_LEVELS } from "../shared/model-info.ts";
import { BENCHMARK_TELEMETRY_PATH_ENV } from "./telemetry-extension.ts";

export type MutationPolicy = "forbid" | "allow" | "require";

export interface BenchmarkRoute {
	modelTier: string;
	model: string;
	thinkingLevel: string;
}

export type BenchmarkEvaluator =
	| { kind: "output-includes"; expected: string }
	| { kind: "command"; command: string; args?: string[]; expectations?: unknown; timeoutMs?: number };

export interface BenchmarkCase {
	id: string;
	agentRole: string;
	route: BenchmarkRoute;
	prompt: string;
	fixture?: string;
	evaluator: BenchmarkEvaluator;
	timeoutMs: number;
	mutationPolicy: MutationPolicy;
}

interface ProcessResult {
	exitCode: number | null;
	signal: NodeJS.Signals | null;
	stdout: string;
	stderr: string;
	timedOut: boolean;
	startedAt: string;
	endedAt: string;
}

interface EvaluationResult {
	passed: boolean;
	kind: BenchmarkEvaluator["kind"];
	evidence: string;
	exitCode?: number | null;
	timedOut?: boolean;
}

interface TranscriptMetrics {
	cumulativeInputTokens: number;
	cumulativeOutputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	peakContextLoad: number;
	reportedCost: number;
	turns: number;
	resolvedModel?: string;
	candidateOutput: string;
}

export interface RunBenchmarkOptions {
	casePath: string;
	outputDir: string;
	env?: NodeJS.ProcessEnv;
}

export interface BenchmarkRunResult {
	passed: boolean;
	outputDir: string;
	receiptPath: string;
	resultPath: string;
	reportPath: string;
}

const BENCHMARK_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = path.resolve(BENCHMARK_DIR, "../..");
const TELEMETRY_EXTENSION_PATH = path.join(BENCHMARK_DIR, "telemetry-extension.ts");

function requiredString(value: unknown, field: string): string {
	if (typeof value !== "string" || !value.trim()) throw new Error(`${field} must be a non-empty string.`);
	return value;
}

export function parseBenchmarkCase(value: unknown): BenchmarkCase {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Benchmark case must be an object.");
	const input = value as Record<string, unknown>;
	const routeInput = input.route;
	if (!routeInput || typeof routeInput !== "object" || Array.isArray(routeInput)) throw new Error("route must be an object.");
	const routeRecord = routeInput as Record<string, unknown>;
	const thinkingLevel = requiredString(routeRecord.thinkingLevel, "route.thinkingLevel");
	if (!THINKING_LEVELS.some((level) => level === thinkingLevel)) throw new Error(`Unsupported Thinking level: ${thinkingLevel}`);
	const evaluatorInput = input.evaluator;
	if (!evaluatorInput || typeof evaluatorInput !== "object" || Array.isArray(evaluatorInput)) throw new Error("evaluator must be an object.");
	const evaluatorRecord = evaluatorInput as Record<string, unknown>;
	let evaluator: BenchmarkEvaluator;
	if (evaluatorRecord.kind === "output-includes") {
		evaluator = { kind: "output-includes", expected: requiredString(evaluatorRecord.expected, "evaluator.expected") };
	} else if (evaluatorRecord.kind === "command") {
		const args = evaluatorRecord.args;
		if (args !== undefined && (!Array.isArray(args) || !args.every((arg) => typeof arg === "string"))) throw new Error("evaluator.args must be an array of strings.");
		const evaluatorTimeout = evaluatorRecord.timeoutMs;
		if (evaluatorTimeout !== undefined && (typeof evaluatorTimeout !== "number" || !Number.isSafeInteger(evaluatorTimeout) || evaluatorTimeout <= 0)) throw new Error("evaluator.timeoutMs must be a positive integer.");
		evaluator = {
			kind: "command",
			command: requiredString(evaluatorRecord.command, "evaluator.command"),
			...(args === undefined ? {} : { args: args as string[] }),
			...(Object.hasOwn(evaluatorRecord, "expectations") ? { expectations: evaluatorRecord.expectations } : {}),
			...(evaluatorTimeout === undefined ? {} : { timeoutMs: evaluatorTimeout as number }),
		};
	} else {
		throw new Error("evaluator.kind must be output-includes or command.");
	}
	const timeoutMs = input.timeoutMs;
	if (typeof timeoutMs !== "number" || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new Error("timeoutMs must be a positive integer.");
	if (!(["forbid", "allow", "require"] as unknown[]).includes(input.mutationPolicy)) throw new Error("mutationPolicy must be forbid, allow, or require.");
	return {
		id: requiredString(input.id, "id"),
		agentRole: requiredString(input.agentRole, "agentRole"),
		route: {
			modelTier: requiredString(routeRecord.modelTier, "route.modelTier"),
			model: requiredString(routeRecord.model, "route.model"),
			thinkingLevel,
		},
		prompt: requiredString(input.prompt, "prompt"),
		...(input.fixture === undefined ? {} : { fixture: requiredString(input.fixture, "fixture") }),
		evaluator,
		timeoutMs,
		mutationPolicy: input.mutationPolicy as MutationPolicy,
	};
}

function spawnCaptured(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; timeoutMs: number }): Promise<ProcessResult> {
	const startedAt = new Date().toISOString();
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"], shell: false });
		let stdout = "";
		let stderr = "";
		let timedOut = false;
		child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
		child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
		child.once("error", reject);
		const timer = setTimeout(() => {
			timedOut = true;
			child.kill("SIGTERM");
			setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 500).unref();
		}, options.timeoutMs);
		child.once("close", (exitCode, signal) => {
			clearTimeout(timer);
			resolve({ exitCode, signal, stdout, stderr, timedOut, startedAt, endedAt: new Date().toISOString() });
		});
	});
}

function copyFixture(fixturePath: string | undefined, workspace: string): void {
	fs.mkdirSync(workspace, { recursive: true });
	if (!fixturePath) return;
	const source = fs.realpathSync(fixturePath);
	if (!fs.statSync(source).isDirectory()) throw new Error(`Fixture must be a directory: ${fixturePath}`);
	fs.cpSync(source, workspace, {
		recursive: true,
		filter: (entry) => path.basename(entry) !== ".git",
	});
}

function workspaceSnapshot(root: string): Record<string, string> {
	const snapshot: Record<string, string> = {};
	function visit(dir: string): void {
		for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
			const absolute = path.join(dir, entry.name);
			const relative = path.relative(root, absolute).split(path.sep).join("/");
			if (entry.isDirectory()) {
				snapshot[relative] = "directory";
				visit(absolute);
			} else if (entry.isFile()) snapshot[relative] = createHash("sha256").update(fs.readFileSync(absolute)).digest("hex");
			else if (entry.isSymbolicLink()) snapshot[relative] = `symlink:${fs.readlinkSync(absolute)}`;
		}
	}
	visit(root);
	return snapshot;
}

function changedFiles(before: Record<string, string>, after: Record<string, string>): string[] {
	return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((file) => before[file] !== after[file]).sort();
}

function parseTranscript(stdout: string): TranscriptMetrics {
	const metrics: TranscriptMetrics = { cumulativeInputTokens: 0, cumulativeOutputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, peakContextLoad: 0, reportedCost: 0, turns: 0, candidateOutput: "" };
	for (const line of stdout.split(/\r?\n/)) {
		if (!line.trim()) continue;
		let event: unknown;
		try { event = JSON.parse(line); } catch { continue; }
		if (!event || typeof event !== "object") continue;
		const record = event as Record<string, unknown>;
		if (record.type !== "message_end" || !record.message || typeof record.message !== "object") continue;
		const message = record.message as Record<string, unknown>;
		if (message.role !== "assistant") continue;
		metrics.turns += 1;
		if (typeof message.model === "string") metrics.resolvedModel = message.model;
		if (Array.isArray(message.content)) {
			const text = message.content.filter((part): part is { type: "text"; text: string } => Boolean(part && typeof part === "object" && (part as { type?: unknown }).type === "text" && typeof (part as { text?: unknown }).text === "string")).map((part) => part.text).join("\n");
			if (text) metrics.candidateOutput = text;
		}
		const usage = message.usage && typeof message.usage === "object" ? message.usage as Record<string, unknown> : {};
		const input = typeof usage.input === "number" ? usage.input : 0;
		const output = typeof usage.output === "number" ? usage.output : 0;
		const cacheRead = typeof usage.cacheRead === "number" ? usage.cacheRead : 0;
		const cacheWrite = typeof usage.cacheWrite === "number" ? usage.cacheWrite : 0;
		metrics.cumulativeInputTokens += input;
		metrics.cumulativeOutputTokens += output;
		metrics.cacheReadTokens += cacheRead;
		metrics.cacheWriteTokens += cacheWrite;
		const totalTokens = typeof usage.totalTokens === "number" && Number.isFinite(usage.totalTokens)
			? usage.totalTokens
			: input + output + cacheRead + cacheWrite;
		metrics.peakContextLoad = Math.max(metrics.peakContextLoad, totalTokens);
		const cost = usage.cost && typeof usage.cost === "object" ? (usage.cost as Record<string, unknown>).total : undefined;
		if (typeof cost === "number" && Number.isFinite(cost)) metrics.reportedCost += cost;
	}
	return metrics;
}

async function evaluate(evaluator: BenchmarkEvaluator, candidateOutput: string, workspace: string, outputDir: string, env: NodeJS.ProcessEnv): Promise<EvaluationResult> {
	if (evaluator.kind === "output-includes") {
		return { kind: evaluator.kind, passed: candidateOutput.includes(evaluator.expected), evidence: candidateOutput.includes(evaluator.expected) ? "Candidate output contained expected value." : "Candidate output omitted expected value." };
	}
	const inputPath = path.join(outputDir, "evaluator-input.json");
	fs.writeFileSync(inputPath, JSON.stringify({ candidateOutput, workspace, expectations: evaluator.expectations }, null, 2), { encoding: "utf-8", mode: 0o600 });
	const replacements: Record<string, string> = { "{input}": inputPath, "{workspace}": workspace };
	const args = (evaluator.args ?? []).map((arg) => replacements[arg] ?? arg);
	const processResult = await spawnCaptured(evaluator.command, args, { cwd: outputDir, env: { ...env, PI_BENCHMARK_EVALUATOR_INPUT: inputPath, PI_BENCHMARK_WORKSPACE: workspace }, timeoutMs: evaluator.timeoutMs ?? 30_000 });
	return { kind: evaluator.kind, passed: processResult.exitCode === 0 && !processResult.timedOut, evidence: (processResult.stdout || processResult.stderr || `Evaluator exited ${processResult.exitCode}.`).trim(), exitCode: processResult.exitCode, timedOut: processResult.timedOut };
}

function resolveSessionTelemetry(sessionPath: string, telemetryPath: string, metrics: TranscriptMetrics): { model: string | null; thinkingLevel: string | null; complete: boolean } {
	let model = metrics.resolvedModel;
	let thinkingLevel: string | undefined;
	try {
		for (const line of fs.readFileSync(sessionPath, "utf-8").split(/\r?\n/)) {
			if (!line.trim()) continue;
			const entry = JSON.parse(line) as Record<string, unknown>;
			if (entry.type === "model_change" && typeof entry.modelId === "string") {
				model = typeof entry.provider === "string" ? `${entry.provider}/${entry.modelId}` : entry.modelId;
			} else if (entry.type === "thinking_level_change" && typeof entry.thinkingLevel === "string") {
				thinkingLevel = entry.thinkingLevel;
			}
		}
	} catch {
		// Missing or malformed session telemetry can fall back to the explicit extension capture.
	}
	try {
		const telemetry = JSON.parse(fs.readFileSync(telemetryPath, "utf-8")) as Record<string, unknown>;
		if (typeof telemetry.model === "string") model = telemetry.model;
		if (typeof telemetry.thinkingLevel === "string") thinkingLevel = telemetry.thinkingLevel;
	} catch {
		// Missing telemetry remains explicit in the normalized result.
	}
	return { model: model ?? null, thinkingLevel: thinkingLevel ?? null, complete: Boolean(model && thinkingLevel) };
}

function writeImmutableJson(filePath: string, value: object): void {
	const descriptor = fs.openSync(filePath, "wx", 0o444);
	try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); } finally { fs.closeSync(descriptor); }
	fs.chmodSync(filePath, 0o444);
}

function reportMarkdown(benchmarkCase: BenchmarkCase, result: Record<string, unknown>): string {
	const metrics = result.metrics as TranscriptMetrics;
	const evaluation = result.evaluation as EvaluationResult;
	return `# Benchmark: ${benchmarkCase.id}\n\n**${result.passed ? "PASS" : "FAIL"}**\n\n- Agent role: ${benchmarkCase.agentRole}\n- Route: ${benchmarkCase.route.modelTier} (${benchmarkCase.route.model}; Thinking level ${benchmarkCase.route.thinkingLevel})\n- Evaluator: ${evaluation.kind} — ${evaluation.passed ? "passed" : "failed"}\n- Mutation policy: ${benchmarkCase.mutationPolicy}\n- Cumulative output tokens: ${metrics.cumulativeOutputTokens}\n- Peak context load: ${metrics.peakContextLoad}\n- Provider-reported cost: $${metrics.reportedCost.toFixed(6)}\n\n## Evaluation\n\n${evaluation.evidence}\n`;
}

export async function runBenchmarkCase(options: RunBenchmarkOptions): Promise<BenchmarkRunResult> {
	const casePath = path.resolve(options.casePath);
	const outputDir = path.resolve(options.outputDir);
	if (fs.existsSync(outputDir)) throw new Error(`Output directory already exists: ${outputDir}`);
	const benchmarkCase = parseBenchmarkCase(JSON.parse(fs.readFileSync(casePath, "utf-8")));
	const fixturePath = benchmarkCase.fixture ? path.resolve(path.dirname(casePath), benchmarkCase.fixture) : undefined;
	if (fixturePath && (outputDir === fixturePath || outputDir.startsWith(`${fixturePath}${path.sep}`))) throw new Error("Output directory must not be inside fixture.");
	fs.mkdirSync(outputDir, { recursive: true });
	const workspace = path.join(outputDir, "workspace");
	copyFixture(fixturePath, workspace);
	const before = workspaceSnapshot(workspace);
	const sessionPath = path.join(outputDir, "session.jsonl");
	if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(benchmarkCase.agentRole)) throw new Error(`Unknown Agent role: ${benchmarkCase.agentRole}`);
	const roleSource = path.join(PACKAGE_ROOT, "agents", `${benchmarkCase.agentRole}.md`);
	if (!fs.existsSync(roleSource)) throw new Error(`Unknown Agent role: ${benchmarkCase.agentRole}`);
	const rolePromptPath = path.join(outputDir, "agent-role.md");
	fs.copyFileSync(roleSource, rolePromptPath);
	const telemetryPath = path.join(outputDir, "resolved-route.json");
	const args = ["--mode", "json", "--session", sessionPath, "--model", benchmarkCase.route.model, "--thinking", benchmarkCase.route.thinkingLevel, "--system-prompt", rolePromptPath, "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-extensions", "--extension", TELEMETRY_EXTENSION_PATH, "-p", benchmarkCase.prompt];
	const env = options.env ?? process.env;
	const candidateEnv = { ...env, [BENCHMARK_TELEMETRY_PATH_ENV]: telemetryPath };
	const spawnSpec = getPiSpawnCommand(args, { env });
	const candidate = await spawnCaptured(spawnSpec.command, spawnSpec.args, { cwd: workspace, env: candidateEnv, timeoutMs: benchmarkCase.timeoutMs });
	const after = workspaceSnapshot(workspace);
	const mutations = changedFiles(before, after);
	const mutationPassed = benchmarkCase.mutationPolicy === "allow" || (benchmarkCase.mutationPolicy === "forbid" ? mutations.length === 0 : mutations.length > 0);
	const metrics = parseTranscript(candidate.stdout);
	const resolved = resolveSessionTelemetry(sessionPath, telemetryPath, metrics);
	const receiptPath = path.join(outputDir, "receipt.json");
	const receipt = {
		schemaVersion: 1,
		case: benchmarkCase,
		invocation: { command: spawnSpec.command, args: spawnSpec.args, cwd: workspace },
		session: { path: sessionPath, fresh: true },
		resolved,
		candidate,
		workspace: { before, after, changedFiles: mutations },
	};
	writeImmutableJson(receiptPath, receipt);
	const evaluation = await evaluate(benchmarkCase.evaluator, metrics.candidateOutput, workspace, outputDir, env);
	const passed = candidate.exitCode === 0 && !candidate.timedOut && mutationPassed && resolved.complete && evaluation.passed;
	const result = {
		schemaVersion: 1,
		caseId: benchmarkCase.id,
		agentRole: benchmarkCase.agentRole,
		route: benchmarkCase.route,
		passed,
		execution: { passed: candidate.exitCode === 0 && !candidate.timedOut, exitCode: candidate.exitCode, timedOut: candidate.timedOut },
		telemetry: { passed: resolved.complete },
		mutation: { policy: benchmarkCase.mutationPolicy, passed: mutationPassed, changedFiles: mutations },
		evaluation,
		metrics,
		resolved,
	};
	const resultPath = path.join(outputDir, "result.json");
	const reportPath = path.join(outputDir, "report.md");
	fs.writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf-8");
	fs.writeFileSync(reportPath, reportMarkdown(benchmarkCase, result), "utf-8");
	return { passed, outputDir, receiptPath, resultPath, reportPath };
}
