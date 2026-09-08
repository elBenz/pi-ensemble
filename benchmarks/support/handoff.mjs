function display(value) {
	return value === null ? "unknown" : Array.isArray(value) ? value.join(", ") : String(value);
}

// Keep prose source-bounded too: every factual statement must match the structured
// evidence. The public case prompt specifies this narrow Markdown handoff format.
export function parseHandoff(text, role, title) {
	if (role === "delegate") return JSON.parse(text);
	const normalized = text.replaceAll("\r\n", "\n").trim();
	const blocks = [...normalized.matchAll(/^```json\n([\s\S]*?)\n```$/gm)];
	if (blocks.length !== 1) throw new Error("Expected one JSON evidence block within the role Markdown handoff.");
	const json = blocks[0][1];
	const answer = JSON.parse(json);
	let expected;
	if (role === "scout") {
		const seam = answer.discoveries.map((entry) => `- ${entry.path}:${entry.startLine}-${entry.endLine} — ${entry.symbol}`).join("\n");
		expected = `# Code Context\n\n## Change seam\n${seam}\n\n## Constraints\nRead-only; no file changes.\n\n## Evidence\n\`\`\`json\n${json}\n\`\`\`\n\n## Open questions\nNone.`;
	} else if (role === "researcher") {
		const summary = answer.claims.map((claim) => `${claim.id}: ${display(claim.value)}.`).join(" ");
		const unknown = answer.claims.filter((claim) => claim.value === null).map((claim) => claim.id);
		const urls = [...new Set(answer.claims.flatMap((claim) => claim.citations.map((citation) => citation.url)))];
		expected = `# Research: ${title}\n\n## Answer\n${summary}\n\n## Findings\n\`\`\`json\n${json}\n\`\`\`\n\n## Gaps\n${unknown.length ? `Unknown: ${unknown.join(", ")}.` : "None."}\n\n## Sources\n${urls.map((url) => `- ${url}`).join("\n")}`;
	} else throw new Error(`Unknown handoff role: ${role}`);
	// Whitespace layout is not a quality signal; structure and all nonblank text are.
	const compact = (value) => value
		.replace(/(^## Answer\n)([\s\S]*?)(?=\n## Findings\n)/m, (_, heading, prose) => `${heading}${prose.trim().replace(/\s+/g, " ")}\n`)
		.split("\n").map((line) => line.trim()).filter(Boolean).join("\n");
	if (compact(normalized) !== compact(expected)) throw new Error("Role Markdown sections contain missing, extra, or inconsistent content.");
	return answer;
}
