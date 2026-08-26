import type { ExtensionAPI, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { SubagentWaitParams } from "../../extension/schemas.ts";
import type { Details, SubagentState } from "../../shared/types.ts";
import { resolveWaitToolConfig, waitForSubagents } from "./subagent-wait.ts";
import type { WaitSubscriptionManager } from "./wait-subscriptions.ts";

export function registerWaitTool(pi: ExtensionAPI, state: SubagentState, enabled = resolveWaitToolConfig().enabled, subscriptions?: Pick<WaitSubscriptionManager, "arm">): void {
	const tool: ToolDefinition<typeof SubagentWaitParams, Details> = {
		name: "subagent_wait",
		label: "Subagent Wait",
		description: `Wait for session-owned background work when this turn needs its result.

Interactive default: return control; Pi wakes the session on completion. Headless runs auto-drain at agent_end.

• {} — first completion or attention event.
• {all:true} — all work active when waiting began.
• {id:"..."} — one async or detached foreground run.
• {id:"...",nonBlocking:true} — arm exact-run wake subscription and return.
• timeoutMs bounds waiting; work continues.

Registered provider work participates in fleet-wide waits. Provider extensions must be loaded in this process.${enabled ? "" : "\n\nConfigured disabled: returns immediately."}`,
		parameters: SubagentWaitParams,
		execute(_id, params, signal, onUpdate, ctx) {
			return waitForSubagents(params, signal, {
				state,
				events: pi.events,
				enabled,
				onUpdate,
				...(subscriptions && ctx?.hasUI ? { subscribe: (input) => subscriptions.arm(input) } : {}),
			});
		},
	};
	pi.registerTool(tool);
}
