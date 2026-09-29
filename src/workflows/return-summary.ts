import { formatWorkflowJsonPreview } from "./scripted-workflow.ts";

export function workflowBrief(value: unknown, limit: number): string {
	const preview = typeof value === "string" ? value : formatWorkflowJsonPreview(value, limit + 1);
	if (preview === undefined) return "(unavailable)";
	return preview.length > limit ? `${preview.slice(0, limit)}…` : preview;
}

/** Project semantic return fields before bulky evidence, for both completion and status. */
export function workflowReturnSummary(value: unknown, limit: number): string {
	if (value && typeof value === "object" && !Array.isArray(value)) {
		const record = value as Record<string, unknown>;
		const fields = ["outcome", "status", "acceptance", "decision", "blockers", "artifact", "artifactPath", "artifacts", "summary"];
		const selected = fields.filter((key) => record[key] !== undefined).slice(0, 6);
		if (selected.length) return workflowBrief(selected.map((key) => `${key}=${workflowBrief(record[key], 120)}`).join("; "), limit);
		if ("output" in record || "results" in record) return workflowBrief(`output=${workflowBrief(record.output ?? record.results, limit - 8)}`, limit);
	}
	if (Array.isArray(value) && value.every((item) => item && typeof item === "object" && "output" in item)) {
		return workflowBrief(`${value.length} child results (see children below)`, limit);
	}
	return workflowBrief(value, limit);
}
