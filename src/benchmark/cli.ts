#!/usr/bin/env node
import * as path from "node:path";
import { runBenchmarkCase } from "./runner.ts";

function usage(): string {
	return "Usage: pi-ensemble-benchmark <case.json> [--output <directory>]";
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

try {
	const options = parseArgs(process.argv.slice(2));
	const result = await runBenchmarkCase(options);
	process.stdout.write(`${result.passed ? "PASS" : "FAIL"} ${result.outputDir}\n`);
	process.exitCode = result.passed ? 0 : 1;
} catch (error) {
	process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
	process.exitCode = 2;
}
