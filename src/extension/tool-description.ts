import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionConfig, ToolDescriptionMode } from "../shared/types.ts";
import { getAgentDir, getProjectConfigDir } from "../shared/utils.ts";

const CUSTOM_TOOL_DESCRIPTION_FILE = "subagent-tool-description.md";
const CUSTOM_TOOL_DESCRIPTION_MAX_BYTES = 50 * 1024;

export const SUBAGENT_SAFETY_GUIDANCE = `SAFETY-CRITICAL SUBAGENT GUIDANCE:
• Use { action: "list" } before execution and only run executable/non-disabled agents.
• Keep execution and management separate: omit action for structured single-child or workflowScript execution; use action only for management/control.
• Async/background runs are the normal default unless config sets asyncByDefault:false; set async:true explicitly when async behavior matters. Use async:false only when foreground behavior itself is required (user watching live, foreground-only UI). Final reviews and gate checks stay async; needing a result is not a foreground reason. After an async launch, continue independent work only until its next dependency barrier; consume the result before work that depends on it. Do not sleep or poll status just to wait; use subagent_wait only when the current request must finish in this turn.
• Ordinary child subagents are not orchestrators. Only explicitly configured fanout children may use the child-safe subagent tool, still bounded by depth/session limits.
• Oracle/advisor consultations should use supervisor dialogue for material unknowns when available; request one-shot only when desired.
• Keep one writer for the same cwd/worktree. Use fresh-context read-only reviewers for independent review, then have the parent synthesize and apply fixes.
• Async runs expose asyncId/asyncDir with status.json, events.jsonl, output logs, status via { action: "status", id }, and lifecycle diagnostics via { action: "debug.run", id }. Include output paths and residual risks when reporting results.`;

export const FULL_SUBAGENT_TOOL_DESCRIPTION = `Run one child with { agent, task? }; use { workflowScript } for orchestration. Omit action for execution. Use action only for management/control actions.

EXECUTION:
• Before executing, use { action: "list" } and run only executable/non-disabled configured agents.
• SINGLE CHILD: { agent:"worker", task:"..." }. This structured form starts exactly one child through the workflow runtime. Workflow-level fields such as model, context, cwd, worktree, output, budgets, acceptance, and async remain defaults for that child. Do not combine agent/task with action or workflowScript.
• WORKFLOW SCRIPT: { workflowScript: "return runs.run('main', {agent:'worker', task:'...'})" }. Use stable-key runs.run for one child and runs.all for parallel children; ordinary JavaScript provides sequence, branching, filtering, retries, and aggregation. workflowScript is an ordinary JavaScript statement body, so use an explicit return for a useful result. Use top-level await, plain helper functions, or explicit Promise chains; nested async function, arrow, and method helpers are rejected. For task text with Markdown fences or shell blocks, build quoted lines instead of nesting raw template literals: \`const task=["Run:","\`\`\`bash","npm test","\`\`\`"].join("\\n")\`. Scripts normally start async unless config sets asyncByDefault:false; set async:true explicitly when async behavior matters. Pass async:false only when foreground behavior itself is required, never for final reviews or gates. Same-repo foreground workflows default to a live in-chat card; set chatProgress to auto, off, or live-card to control that projection. Workflow-level child controls default onto each runs.run launch, and explicit child fields override them. Use {action:"children.list"} to list recent retained workflow children with resumable/not-resumable reasons. Resume only rows reported resumable. For a simple follow-up or implementation challenge, use {action:"resume", id:"run-id", message:"..."}. Resume keeps the stored agent/model/tool contract. If no resumable child is listed, launch a same-role fallback challenge and label it as fallback. Inside workflowScript, continue one with runs.run(key, {resume:"run-id", task:"follow-up"}); workflow resumes wait for completed output, and loops must continue from each latest returned runId. Await runs.steer(key, message, {mode?, index?, ackTimeoutMs?}) to guide a prior keyed child without exposing its run id; receipts are queued, delivered, missed, or failed. Always await or return runs.steer. For repository mutation lanes, set worktree:true on the workflow or individual runs.run/runs.all item for managed isolation; each parallel child gets a separate worktree and handoff artifact. A workflow usageBudget is enforced once across the workflow. Available globals are runs.run, runs.all, runs.steer, runs.status, runs.ref/refs, emit, console, and standard JavaScript only. Workflows get async state.get(key) and state.set(key, JSONValue) through their automatic or explicit mission; mission:false workflows do not have a state global. Scripts cannot access filesystem, shell, arbitrary Pi tools, or host globals.
• Sequential example: { workflowScript: "const a = await runs.run('analyze', {agent:'agent-a', task:'Analyze the request'}); return (await runs.run('plan', {agent:'agent-b', task:'Plan from: '+a.output})).output" }
• Parallel example: { workflowScript: "const [a,b] = await runs.all([{key:'correctness',agent:'agent-a',task:'Review correctness'},{key:'tests',agent:'agent-b',task:'Review tests'}]); return {correctness:a.output,tests:b.output}" }
• Optional context is "fresh" or "fork". Explicit context wins. When omitted, config defaultSubagentContext wins over agent defaultContext. timeoutMs/maxRuntimeMs apply to foreground and async workflows; foreground workflows default to 30 minutes and async workflows have no default timeout. Omit acceptance for reviewer/read-only calls; evidence levels end at verified, and acceptance.review.required requests independent writer review.
• Durable mission attachment is automatic by default. Use missionId to attach an existing mission, mission:{...} to override auto-create, or mission:false for ephemeral work. A mission object needs exactly one non-empty title or summary; objective and labels are optional. goal may only be true and requires budget:{tokens}.

MANAGEMENT / CONTROL (use action; omit execution fields):
• list, get, models, guide, children.list, create, update, delete, eject, disable, enable, reset, status, debug.run, doctor, grant-spawn-budget, worktree.discard, refine/refine.show/refine.rollback, mission.create/list/show/update/resolve-decision/attach-run/close, inspector.open/status/close, project.open/status/close, and watchdog actions remain available. Use {action:"guide", topic:"overview"} for packaged current-version help; topics are overview, workflows, agents, missions, observability, tool-reference, configuration, models, watchdog, and extension-api.
• status, interrupt, stop, resume, and steer manage live or persisted runs. Use status view:"fleet" for an overview or view:"transcript" with id and optional index to tail output.
• Create durable project schedules with { action:"schedule.create", id?, name?, at:"+10m" | ISO, workflowScript:"return runs.run('main', {agent:'worker', task:'...'})" } or { every:"6h", workflowScript:"..." }. Manage them with schedule.list/show/history/pause/resume/run/run-due/delete. This first slice supports fixed intervals; calendar schedules and schedule mission attachment are deferred.

${SUBAGENT_SAFETY_GUIDANCE}`;

export const COMPACT_SUBAGENT_TOOL_DESCRIPTION = `Delegate work to child agents. Use {action:"list"} before first launch; select executable agents.

EXECUTE — omit action.
• One child: {agent:"worker",task:"..."}. Agent/task cannot combine with action or workflowScript.
• Workflow: {workflowScript:"return runs.run('main',{agent:'worker',task:'...'})"}. Use stable keys; runs.run launches one, runs.all launches parallel work. Await or return runs.steer(key,message,options?); it targets a prior key, not a run id.
• Scripts are JavaScript statement bodies: return results explicitly; use top-level await, plain functions, or Promise chains. Nested async helpers are rejected. Build fenced task text with quoted lines joined by "\\n". Mission workflows expose async state.get/state.set; mission:false does not.
• Resume only entries marked resumable by {action:"children.list"}. Use {action:"resume",id,message} for simple follow-up, or runs.run(key,{resume,task}) when the workflow must await it; continue from latest runId. Resume preserves child contract. Otherwise launch a labeled same-role fallback.
• Isolate mutation lanes with worktree:true. Keep one writer per cwd/worktree; use fresh read-only reviewers, then synthesize in parent.

MANAGE — set action and omit execution fields. Use guide for current action/config details.

ASYNC / SAFETY
• Background is default. Use async:false only for foreground UI. Continue independent work until dependency barrier; then consume result. Return control in interactive chat; use subagent_wait only when this turn must receive results.
• Ordinary children execute assigned work; only configured fanout children delegate. Advisors use supervisor dialogue for material unknowns.
• context is fresh or fork; explicit value wins. Omit acceptance for read-only/reviewer work.
• Mission objects set exactly one title or summary. goal:true requires budget:{tokens}.`;


function isToolDescriptionMode(value: unknown): value is ToolDescriptionMode {
	return value === "full" || value === "compact" || value === "custom";
}

function warn(options: ToolDescriptionOptions | undefined, message: string): void {
	(options?.warn ?? console.warn)(`[pi-subagents] ${message}`);
}

export interface ToolDescriptionOptions {
	cwd?: string;
	agentDir?: string;
	warn?: (message: string) => void;
}

export function resolveToolDescriptionMode(config: Pick<ExtensionConfig, "toolDescriptionMode">, options?: ToolDescriptionOptions): ToolDescriptionMode {
	const mode = config.toolDescriptionMode;
	if (mode === undefined) return "compact";
	if (isToolDescriptionMode(mode)) return mode;
	warn(options, `Ignoring invalid toolDescriptionMode ${JSON.stringify(mode)}; expected "full", "compact", or "custom".`);
	return "full";
}

function customDescriptionPaths(options?: ToolDescriptionOptions): string[] {
	const cwd = options?.cwd ?? process.cwd();
	const agentDir = options?.agentDir ?? getAgentDir();
	return [
		path.join(getProjectConfigDir(cwd), CUSTOM_TOOL_DESCRIPTION_FILE),
		path.join(agentDir, CUSTOM_TOOL_DESCRIPTION_FILE),
	];
}

function renderCustomTemplate(template: string, options?: ToolDescriptionOptions): string {
	const cwd = options?.cwd ?? process.cwd();
	const agentDir = options?.agentDir ?? getAgentDir();
	const projectConfigDir = getProjectConfigDir(cwd);
	const variables: Record<string, () => string> = {
		fullDescription: () => FULL_SUBAGENT_TOOL_DESCRIPTION,
		full: () => FULL_SUBAGENT_TOOL_DESCRIPTION,
		compactDescription: () => COMPACT_SUBAGENT_TOOL_DESCRIPTION,
		compact: () => COMPACT_SUBAGENT_TOOL_DESCRIPTION,
		safetyGuidance: () => SUBAGENT_SAFETY_GUIDANCE,
		safety: () => SUBAGENT_SAFETY_GUIDANCE,
		agentDir: () => agentDir,
		projectConfigDir: () => projectConfigDir,
	};
	return template.replace(/\{\{(\w+)\}\}/g, (raw, name: string) => {
		const replacement = variables[name];
		if (replacement) return replacement();
		warn(options, `${CUSTOM_TOOL_DESCRIPTION_FILE}: unknown placeholder ${raw} left unchanged.`);
		return raw;
	});
}

function loadCustomToolDescription(options?: ToolDescriptionOptions): string | undefined {
	for (const filePath of customDescriptionPaths(options)) {
		let stat: fs.Stats;
		try {
			stat = fs.statSync(filePath);
		} catch (error) {
			if (typeof error === "object" && error !== null && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") continue;
			warn(options, `Failed to inspect custom tool description '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
			continue;
		}
		if (!stat.isFile()) {
			warn(options, `Ignoring custom tool description '${filePath}' because it is not a file.`);
			continue;
		}
		if (stat.size > CUSTOM_TOOL_DESCRIPTION_MAX_BYTES) {
			warn(options, `Ignoring custom tool description '${filePath}' because it is larger than ${CUSTOM_TOOL_DESCRIPTION_MAX_BYTES} bytes.`);
			continue;
		}
		try {
			const template = fs.readFileSync(filePath, "utf-8").trim();
			if (!template) {
				warn(options, `Ignoring empty custom tool description '${filePath}'.`);
				continue;
			}
			const rendered = renderCustomTemplate(template, options).trim();
			if (!rendered) {
				warn(options, `Ignoring custom tool description '${filePath}' because it rendered empty.`);
				continue;
			}
			return rendered;
		} catch (error) {
			warn(options, `Failed to read custom tool description '${filePath}': ${error instanceof Error ? error.message : String(error)}`);
		}
	}
	return undefined;
}

function withMandatorySafetyGuidance(description: string): string {
	const customDescription = description
		.split(SUBAGENT_SAFETY_GUIDANCE)
		.map((part) => part.trim())
		.filter(Boolean)
		.join("\n\n");
	return customDescription
		? `${customDescription}\n\n${SUBAGENT_SAFETY_GUIDANCE}`
		: SUBAGENT_SAFETY_GUIDANCE;
}

export function buildSubagentToolDescription(config: Pick<ExtensionConfig, "toolDescriptionMode"> = {}, options?: ToolDescriptionOptions): string {
	const mode = resolveToolDescriptionMode(config, options);
	let description: string;
	if (mode === "compact") description = COMPACT_SUBAGENT_TOOL_DESCRIPTION;
	else if (mode === "custom") {
		const custom = loadCustomToolDescription(options);
		if (custom) description = withMandatorySafetyGuidance(custom);
		else {
			warn(options, `${CUSTOM_TOOL_DESCRIPTION_FILE} was not found or valid for toolDescriptionMode "custom"; using full description.`);
			description = FULL_SUBAGENT_TOOL_DESCRIPTION;
		}
	} else description = FULL_SUBAGENT_TOOL_DESCRIPTION;
	return description;
}
