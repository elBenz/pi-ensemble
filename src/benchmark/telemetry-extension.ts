import * as fs from "node:fs";
import * as path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export const BENCHMARK_TELEMETRY_PATH_ENV = "PI_ENSEMBLE_BENCHMARK_TELEMETRY_PATH";

export default function benchmarkTelemetry(pi: ExtensionAPI): void {
	pi.on("agent_start", (_event, ctx) => {
		const outputPath = process.env[BENCHMARK_TELEMETRY_PATH_ENV];
		if (!outputPath || !ctx.model) return;
		fs.mkdirSync(path.dirname(outputPath), { recursive: true });
		fs.writeFileSync(outputPath, JSON.stringify({
			model: `${ctx.model.provider}/${ctx.model.id}`,
			thinkingLevel: pi.getThinkingLevel(),
		}), { encoding: "utf-8", mode: 0o600 });
	});
}
