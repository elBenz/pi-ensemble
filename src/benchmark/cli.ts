#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { runBenchmarkCase } from "./runner.ts";
import { runBenchmarkPlan } from "./suite.ts";
import { DEEPSWE_SOURCE_URL, importDeepSweSnapshot, regenerateDeepSweReport } from "./deepswe.ts";

function usage(): string {
	return "Usage: pi-ensemble-benchmark <case-or-plan.json> [--output <directory>]\n       pi-ensemble-benchmark import-deepswe <artifact.json> --output <directory> --retrieved-at <ISO-8601> [--source-url <url>] [--current-pricing <file>]\n       pi-ensemble-benchmark report-deepswe <snapshot-directory> --output <directory>";
}

function parseArgs(args: string[]): { casePath: string; outputDir: string } {
	const casePath = args[0];
	if (!casePath || casePath.startsWith("-")) throw new Error(usage());
	let outputDir: string | undefined;
	for (let index = 1; index < args.length; index += 1) {
		if (args[index] !== "--output" || !args[index + 1] || index + 2 !== args.length) throw new Error(usage());
		outputDir = args[index + 1];
		index += 1;
	}
	const defaultName = `${path.basename(casePath, path.extname(casePath))}-${new Date().toISOString().replace(/[:.]/g, "-")}`;
	return { casePath, outputDir: outputDir ?? path.resolve("benchmark-results", defaultName) };
}

function parseDeepSweArgs(args: string[], command: "import-deepswe" | "report-deepswe"): { input: string; output: string; retrievedAt?: string; sourceUrl?: string; currentPricing?: string } {
	const input = args[1];
	if (!input || input.startsWith("-")) throw new Error(usage());
	let output: string | undefined; let retrievedAt: string | undefined; let sourceUrl: string | undefined; let currentPricing: string | undefined;
	for (let index = 2; index < args.length; index += 2) {
		const value = args[index + 1]; if (!value) throw new Error(usage());
		if (args[index] === "--output") output = value;
		else if (command === "import-deepswe" && args[index] === "--retrieved-at") retrievedAt = value;
		else if (command === "import-deepswe" && args[index] === "--source-url") sourceUrl = value;
		else if (command === "import-deepswe" && args[index] === "--current-pricing") currentPricing = value;
		else throw new Error(usage());
	}
	if (!output || (command === "import-deepswe" && !retrievedAt)) throw new Error(usage());
	return { input, output, retrievedAt, sourceUrl, currentPricing };
}

try {
	const args = process.argv.slice(2);
	if (args[0] === "import-deepswe") {
		const options = parseDeepSweArgs(args, "import-deepswe");
		const imported = importDeepSweSnapshot({ artifactPath: path.resolve(options.input), outputDir: path.resolve(options.output), provenance: { sourceUrl: options.sourceUrl ?? DEEPSWE_SOURCE_URL, retrievedAt: options.retrievedAt!, benchmarkVersion: "v1.1" }, ...(options.currentPricing ? { currentPricing: JSON.parse(fs.readFileSync(path.resolve(options.currentPricing), "utf8")) as Record<string, import("./deepswe.ts").DeepSweCurrentPricing> } : {}) });
		process.stdout.write(`PASS ${imported.snapshotDir}\n`);
	} else if (args[0] === "report-deepswe") {
		const options = parseDeepSweArgs(args, "report-deepswe");
		const result = regenerateDeepSweReport(path.resolve(options.input), path.resolve(options.output));
		process.stdout.write(`PASS ${result.reportPath}\n`);
	} else {
		const options = parseArgs(args);
		const input = JSON.parse(fs.readFileSync(path.resolve(options.casePath), "utf-8")) as Record<string, unknown>;
		const result = Array.isArray(input.launches)
			? await runBenchmarkPlan({ planPath: options.casePath, outputDir: options.outputDir, onWarning: (warning) => process.stderr.write(`WARNING: ${warning}\n`) })
			: await runBenchmarkCase(options);
		process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.outputDir}\n`);
		process.exitCode = result.passed ? 0 : 1;
	}
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 2;
}
