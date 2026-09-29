import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { changedPaths } from './scope.mjs';
import { checkBehavior as legacy } from './legacy-checks.mjs';
import { checkBehavior } from './checks.mjs';
const input = JSON.parse(fs.readFileSync(process.env.PI_BENCHMARK_EVALUATOR_INPUT, 'utf8'));
const expected = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const checks = { mutation: false, isolation: false, visible: false, hidden: false };
try {
  const changed = changedPaths(path.resolve(path.dirname(process.argv[2]), expected.fixture), input.workspace);
  checks.mutation = changed.length > 0;
  checks.isolation = changed.every(name => expected.allowed.includes(name));
  if (!checks.isolation) throw new Error('out-of-scope edits');
  if (expected.workerTests && !fs.existsSync(path.join(input.workspace, expected.workerTests))) throw new Error('required worker-authored tests missing');
  const testFiles = ['focused.test.mjs', ...(expected.workerTests ? [expected.workerTests] : [])];
  const test = spawnSync(process.execPath, ['--test', ...testFiles], { cwd: input.workspace, timeout: 5000, encoding: 'utf8' });
  checks.visible = test.status === 0;
  if (['deadline', 'boundary', 'records'].includes(expected.behavior)) await legacy(expected.behavior, input.workspace);
  else await checkBehavior(expected.behavior, input.workspace);
  checks.hidden = true;
} catch (error) { checks.error = error.message; }
finally {
  try {
    checks.isolation = checks.isolation && changedPaths(path.resolve(path.dirname(process.argv[2]), expected.fixture), input.workspace).every(name => expected.allowed.includes(name));
  } catch (error) { checks.isolation = false; checks.error = error.message; }
}
const values = Object.values(checks).filter(value => typeof value === 'boolean');
const passed = values.every(Boolean);
console.log(JSON.stringify({ schemaVersion: 1, role: 'worker', passed, score: values.filter(Boolean).length / values.length, checks }));
process.exitCode = passed ? 0 : 1;
