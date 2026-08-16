export const SUBAGENT_ORCHESTRATION_SKILL = "pi-ensemble";
export const LEGACY_SUBAGENT_ORCHESTRATION_SKILL = "pi-subagents";

export const SUBAGENT_ORCHESTRATION_SKILLS = new Set([
	SUBAGENT_ORCHESTRATION_SKILL,
	LEGACY_SUBAGENT_ORCHESTRATION_SKILL,
]);

export function isSubagentOrchestrationSkill(name: string): boolean {
	return SUBAGENT_ORCHESTRATION_SKILLS.has(name.trim());
}

export function findSubagentOrchestrationSkill(names: string[]): string | undefined {
	return names.find(isSubagentOrchestrationSkill)?.trim();
}

export function unavailableSubagentOrchestrationSkillError(names: string[]): string | undefined {
	const name = findSubagentOrchestrationSkill(names);
	return name ? `Skills not found: ${name}` : undefined;
}

export function migrateLegacyOrchestrationSkillCommand(text: string): string | undefined {
	if (!/^\/skill:pi-subagents(?=\s|$)/.test(text)) return undefined;
	return text.replace(/^\/skill:pi-subagents/, `/skill:${SUBAGENT_ORCHESTRATION_SKILL}`);
}
