import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
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

export interface BenchmarkSource {
	repository: string;
	revision: string;
}

export interface BenchmarkCase {
	id: string;
	agentRole: string;
	route: BenchmarkRoute;
	prompt: string;
	fixture?: string;
	source?: BenchmarkSource;
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
	let source: BenchmarkSource | undefined;
	if (input.source !== undefined) {
		if (!input.source || typeof input.source !== "object" || Array.isArray(input.source)) throw new Error("source must be an object.");
		const sourceRecord = input.source as Record<string, unknown>;
		const revision = requiredString(sourceRecord.revision, "source.revision");
		if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(revision)) throw new Error("source.revision must be a full commit hash.");
		source = {
			repository: requiredString(sourceRecord.repository, "source.repository"),
			revision,
		};
	}
	if (input.fixture !== undefined && source) throw new Error("fixture and source are mutually exclusive.");
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
		...(source ? { source } : {}),
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

function runGit(args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): string {
	const result = spawnSync("git", args, {
		cwd: options.cwd,
		env: options.env ?? process.env,
		encoding: "utf-8",
		maxBuffer: 10 * 1024 * 1024,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) throw new Error((result.stderr || result.stdout || `git exited ${result.status}`).trim());
	return result.stdout.trim();
}

function candidateEnvironment(env: NodeJS.ProcessEnv, workspace: string, telemetryPath: string, hiddenRoots: string[]): NodeJS.ProcessEnv {
	const candidateEnv: NodeJS.ProcessEnv = { ...env, PWD: workspace, [BENCHMARK_TELEMETRY_PATH_ENV]: telemetryPath };
	let inheritedPath = "";
	for (const key of Object.keys(candidateEnv)) {
		const normalized = key.toLowerCase();
		if (normalized === "path") {
			inheritedPath ||= candidateEnv[key] ?? "";
			delete candidateEnv[key];
		} else if (normalized === "oldpwd" || normalized === "init_cwd" || normalized === "pi_session_file" || normalized === "pi_session_id" || normalized.startsWith("pi_subagent_") || normalized.startsWith("npm_")) {
			delete candidateEnv[key];
		}
	}
	const roots = hiddenRoots.map((root) => path.resolve(root));
	candidateEnv.PATH = inheritedPath.split(path.delimiter).filter((entry) => {
		if (!entry) return false;
		const resolved = path.resolve(entry);
		return !roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
	}).join(path.delimiter);
	return candidateEnv;
}

function exportSourceRevision(repository: string, revision: string, workspace: string, indexPath: string): string {
	const sourceRepo = fs.realpathSync(repository);
	if (!fs.statSync(sourceRepo).isDirectory()) throw new Error(`Source repository must be a directory: ${repository}`);
	const resolvedCommit = runGit(["rev-parse", "--verify", "--end-of-options", `${revision}^{commit}`], { cwd: sourceRepo });
	const gitDir = runGit(["rev-parse", "--path-format=absolute", "--git-dir"], { cwd: sourceRepo });
	fs.mkdirSync(workspace, { recursive: true });
	const gitEnv: NodeJS.ProcessEnv = { ...process.env, GIT_INDEX_FILE: indexPath };
	delete gitEnv.GIT_WORK_TREE;
	runGit(["--git-dir", gitDir, "--work-tree", workspace, "read-tree", resolvedCommit], { env: gitEnv });
	runGit(["--git-dir", gitDir, "--work-tree", workspace, "checkout-index", "--all", "--force"], { env: gitEnv });
	return resolvedCommit;
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

async function evaluate(evaluator: BenchmarkEvaluator, candidateOutput: string, workspace: string, outputDir: string, caseDir: string, env: NodeJS.ProcessEnv): Promise<EvaluationResult> {
	if (evaluator.kind === "output-includes") {
		return { kind: evaluator.kind, passed: candidateOutput.includes(evaluator.expected), evidence: candidateOutput.includes(evaluator.expected) ? "Candidate output contained expected value." : "Candidate output omitted expected value." };
	}
	const inputPath = path.join(outputDir, "evaluator-input.json");
	fs.writeFileSync(inputPath, JSON.stringify({ candidateOutput, workspace, expectations: evaluator.expectations }, null, 2), { encoding: "utf-8", mode: 0o600 });
	const replacements: Record<string, string> = { "{input}": inputPath, "{workspace}": workspace, "{caseDir}": caseDir };
	const args = (evaluator.args ?? []).map((arg) => Object.entries(replacements).reduce((value, [token, replacement]) => value.replaceAll(token, replacement), arg));
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
	const caseDir = path.dirname(casePath);
	const fixturePath = benchmarkCase.fixture ? path.resolve(caseDir, benchmarkCase.fixture) : undefined;
	if (fixturePath && (outputDir === fixturePath || outputDir.startsWith(`${fixturePath}${path.sep}`))) throw new Error("Output directory must not be inside fixture.");
	fs.mkdirSync(outputDir, { recursive: true });

	let candidateRoot: string | undefined;
	let sourceReceipt: { repository: string; revision: string; resolvedCommit: string } | undefined;
	const sourceRepository = benchmarkCase.source ? path.resolve(caseDir, benchmarkCase.source.repository) : undefined;
	const workspace = benchmarkCase.source
		? path.join(candidateRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-ensemble-benchmark-candidate-")), "workspace")
		: path.join(outputDir, "workspace");
	try {
		if (benchmarkCase.source) {
			const resolvedCommit = exportSourceRevision(sourceRepository!, benchmarkCase.source.revision, workspace, path.join(candidateRoot!, "index"));
			sourceReceipt = { repository: sourceRepository!, revision: benchmarkCase.source.revision, resolvedCommit };
		} else {
			copyFixture(fixturePath, workspace);
		}
		const before = workspaceSnapshot(workspace);
		const sessionPath = path.join(outputDir, "session.jsonl");
		if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(benchmarkCase.agentRole)) throw new Error(`Unknown Agent role: ${benchmarkCase.agentRole}`);
		const roleSource = path.join(PACKAGE_ROOT, "agents", `${benchmarkCase.agentRole}.md`);
		if (!fs.existsSync(roleSource)) throw new Error(`Unknown Agent role: ${benchmarkCase.agentRole}`);
		const artifactRolePromptPath = path.join(outputDir, "agent-role.md");
		fs.copyFileSync(roleSource, artifactRolePromptPath);
		const supportDir = candidateRoot ? path.join(candidateRoot, "support") : outputDir;
		fs.mkdirSync(supportDir, { recursive: true });
		const rolePromptPath = candidateRoot ? path.join(supportDir, "agent-role.md") : artifactRolePromptPath;
		if (candidateRoot) fs.copyFileSync(roleSource, rolePromptPath);
		const candidateSessionPath = path.join(supportDir, "session.jsonl");
		const telemetryPath = path.join(outputDir, "resolved-route.json");
		const candidateTelemetryPath = path.join(supportDir, "resolved-route.json");
		const extensionPath = candidateRoot ? path.join(supportDir, "telemetry-extension.ts") : TELEMETRY_EXTENSION_PATH;
		if (candidateRoot) fs.copyFileSync(TELEMETRY_EXTENSION_PATH, extensionPath);
		const args = ["--mode", "json", "--session", candidateSessionPath, "--model", benchmarkCase.route.model, "--thinking", benchmarkCase.route.thinkingLevel, "--system-prompt", rolePromptPath, "--no-context-files", "--no-skills", "--no-prompt-templates", "--no-extensions", "--extension", extensionPath, "-p", benchmarkCase.prompt];
		const env = options.env ?? process.env;
		const candidateEnv = candidateEnvironment(env, workspace, candidateTelemetryPath, [sourceRepository, PACKAGE_ROOT, caseDir, outputDir].filter((value): value is string => Boolean(value)));
		const spawnSpec = getPiSpawnCommand(args, { env });
		const candidate = await spawnCaptured(spawnSpec.command, spawnSpec.args, { cwd: workspace, env: candidateEnv, timeoutMs: benchmarkCase.timeoutMs });
		if (candidateRoot) {
			if (fs.existsSync(candidateSessionPath)) fs.copyFileSync(candidateSessionPath, sessionPath);
			if (fs.existsSync(candidateTelemetryPath)) fs.copyFileSync(candidateTelemetryPath, telemetryPath);
		}
		const after = workspaceSnapshot(workspace);
		const mutations = changedFiles(before, after);
		const mutationPassed = benchmarkCase.mutationPolicy === "allow" || (benchmarkCase.mutationPolicy === "forbid" ? mutations.length === 0 : mutations.length > 0);
		const metrics = parseTranscript(candidate.stdout);
		const resolved = resolveSessionTelemetry(sessionPath, telemetryPath, metrics);
		const receiptPath = path.join(outputDir, "receipt.json");
		const receipt = {
			schemaVersion: 1,
			case: benchmarkCase,
			...(sourceReceipt ? { source: sourceReceipt } : {}),
			invocation: { command: spawnSpec.command, args: spawnSpec.args, cwd: workspace },
			session: { path: sessionPath, fresh: true },
			resolved,
			candidate,
			workspace: { before, after, changedFiles: mutations },
		};
		writeImmutableJson(receiptPath, receipt);
		const evaluation = await evaluate(benchmarkCase.evaluator, metrics.candidateOutput, workspace, outputDir, caseDir, env);
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
	} finally {
		if (candidateRoot) fs.rmSync(candidateRoot, { recursive: true, force: true });
	}
}
