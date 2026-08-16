import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	findSubagentOrchestrationSkill,
	isSubagentOrchestrationSkill,
	migrateLegacyOrchestrationSkillCommand,
	unavailableSubagentOrchestrationSkillError,
} from "../../src/agents/orchestration-skill.ts";

describe("orchestration skill naming", () => {
	it("recognizes current and legacy names", () => {
		assert.equal(isSubagentOrchestrationSkill("pi-ensemble"), true);
		assert.equal(isSubagentOrchestrationSkill("pi-subagents"), true);
		assert.equal(isSubagentOrchestrationSkill("other"), false);
		assert.equal(findSubagentOrchestrationSkill(["other", "pi-ensemble"]), "pi-ensemble");
		assert.equal(unavailableSubagentOrchestrationSkillError(["pi-subagents"]), "Skills not found: pi-subagents");
	});

	it("migrates the hidden legacy command alias", () => {
		assert.equal(migrateLegacyOrchestrationSkillCommand("/skill:pi-subagents"), "/skill:pi-ensemble");
		assert.equal(migrateLegacyOrchestrationSkillCommand("/skill:pi-subagents review this"), "/skill:pi-ensemble review this");
		assert.equal(migrateLegacyOrchestrationSkillCommand("/skill:pi-subagents-extra"), undefined);
		assert.equal(migrateLegacyOrchestrationSkillCommand("prefix /skill:pi-subagents"), undefined);
	});
});
