import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it } from "node:test";

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });

function run(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [path.resolve("benchmark-runner.mjs"), ...args], { cwd, env, stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		child.stdout.on("data", (chunk) => { stdout += chunk; });
		child.stderr.on("data", (chunk) => { stderr += chunk; });
		child.once("error", reject);
		child.once("close", (code) => resolve({ code, stdout, stderr }));
	});
}

describe("DeepSWE CLI", () => {
	it("imports and regenerates offline without network, Pi, or global-config access", async () => {
		const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-deepswe-cli-"));
		dirs.push(root);
		const tripwire = path.join(root, "pi-must-not-run");
		fs.writeFileSync(tripwire, "#!/bin/sh\necho Pi was launched >&2\nexit 91\n", { mode: 0o755 });
		const guard = path.join(root, "offline-guard.mjs");
		const attempted = path.join(root, "forbidden-attempt");
		fs.writeFileSync(guard, `
import fs from 'node:fs';
import childProcess from 'node:child_process';
import net from 'node:net';
import { syncBuiltinESMExports } from 'node:module';
const forbidden = () => {
  fs.writeFileSync(${JSON.stringify(attempted)}, 'Network or child process attempted');
  throw new Error('Offline evidence command attempted network or child process');
};
globalThis.fetch = forbidden;
net.Socket.prototype.connect = forbidden;
for (const key of ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork']) childProcess[key] = forbidden;
syncBuiltinESMExports();
`);
		const home = path.join(root, "home");
		fs.mkdirSync(home);
		const artifact = path.resolve("docs/research/deepswe-refresh/leaderboard-live.json");
		const evidence = path.join(root, "evidence");
		const environment = { ...process.env, HOME: home, PI_SUBAGENT_PI_BINARY: tripwire, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${pathToFileURL(guard).href}` };
		const imported = await run(["import-deepswe", artifact, "--output", evidence, "--retrieved-at", "2026-09-07T11:37:08.124933+00:00"], process.cwd(), environment);
		assert.equal(imported.code, 0, imported.stderr);
		assert.match(imported.stdout, /^PASS /);
		const snapshot = fs.readdirSync(evidence).find((entry) => entry.startsWith("deepswe-"));
		assert.ok(snapshot);
		const report = await run(["report-deepswe", path.join(evidence, snapshot!), "--output", path.join(root, "report")], process.cwd(), environment);
		assert.equal(report.code, 0, report.stderr);
		assert.equal(fs.existsSync(path.join(root, "report", "report.md")), true);
		assert.deepEqual(fs.readdirSync(home), []);
		assert.equal(fs.existsSync(attempted), false);
	});
});
