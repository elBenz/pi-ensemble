import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const input = JSON.parse(fs.readFileSync(process.env.PI_BENCHMARK_EVALUATOR_INPUT, "utf8"));
const storeUrl = pathToFileURL(path.join(input.workspace, "src/missions/store.ts")).href;
const testRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pi-benchmark-mission-evaluator-"));

try {
  const behaviorCheck = [
    'import assert from "node:assert/strict";',
    'import fs from "node:fs";',
    'import path from "node:path";',
    'import { syncBuiltinESMExports } from "node:module";',
    'const originalRename = fs.renameSync;',
    'let scenario; let removeExisting = false;',
    'fs.renameSync = (from, to) => {',
    '  if (removeExisting && to.endsWith(".lock")) { fs.rmSync(to, { recursive: true, force: true }); removeExisting = false; }',
    '  if (scenario && to.endsWith(".lock")) {',
    '    const active = scenario; scenario = undefined;',
    '    if (active.existing) { fs.mkdirSync(to, { recursive: true }); removeExisting = true; }',
    '    const error = new Error(active.code); error.code = active.code; throw error;',
    '  }',
    '  return originalRename(from, to);',
    '};',
    'syncBuiltinESMExports();',
    `const { createMission, resolveMissionStoreLocation, updateMission } = await import(${JSON.stringify(storeUrl)});`,
    `const root = ${JSON.stringify(testRoot)};`,
    'let sequence = 0;',
    'const run = (code, existing, shouldPass) => {',
    '  const base = path.join(root, String(sequence++));',
    '  const location = resolveMissionStoreLocation({ projectRoot: path.join(base, "project"), agentDir: path.join(base, "agent") });',
    '  const mission = createMission(location, { title: code, objective: "collision retry", status: "active" });',
    '  scenario = { code, existing };',
    '  if (shouldPass) assert.doesNotThrow(() => updateMission(location, mission.id, { summary: "updated" }));',
    '  else assert.throws(() => updateMission(location, mission.id, { summary: "must propagate" }), error => error?.code === code);',
    '};',
    'run("EEXIST", false, true);',
    'run("ENOTEMPTY", false, true);',
    'run("EPERM", true, true);',
    'run("EPERM", false, false);',
  ].join("\n");
  const completed = spawnSync(process.execPath, ["--experimental-strip-types", "--input-type=module", "--eval", behaviorCheck], {
    cwd: input.workspace,
    encoding: "utf8",
    timeout: 20_000,
  });
  assert.equal(completed.status, 0, completed.stderr || completed.stdout);
  process.stdout.write("known collision regressions and unseen guarded-EPERM behavior passed");
} finally {
  fs.rmSync(testRoot, { recursive: true, force: true });
}
