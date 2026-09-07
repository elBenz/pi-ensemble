function record(value: unknown): Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function finiteCount(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

/** Read the adapter's raw Responses snapshot, never its zero-filled numeric Usage. */
export function readProviderUsage(message: Record<string, unknown>): { usage: Record<string, unknown>; issue?: string } {
	const provenance = record(message.usageProvenance);
	if (provenance.schemaVersion !== 1 || provenance.source !== "openai-responses"
		|| !["openai-responses", "openai-codex-responses", "azure-openai-responses"].includes(String(message.api))) {
		return { usage: {}, issue: "Provider usage provenance missing or unsupported." };
	}
	const raw = record(provenance.rawUsage);
	const inputDetails = record(raw.input_tokens_details);
	const outputDetails = record(raw.output_tokens_details);
	const cacheRead = inputDetails.cached_tokens;
	const cacheWrite = inputDetails.cache_write_tokens;
	// Responses input includes cache reads/writes. Missing categories prevent a
	// trustworthy uncached input count; inconsistent/overflowing subtraction is invalid.
	const input = finiteCount(raw.input_tokens)
		? finiteCount(cacheRead) && finiteCount(cacheWrite) ? raw.input_tokens - cacheRead - cacheWrite : null
		: raw.input_tokens;
	return { usage: {
		input,
		output: raw.output_tokens,
		cacheRead,
		cacheWrite,
		reasoning: outputDetails.reasoning_tokens,
		totalTokens: raw.total_tokens,
	} };
}
