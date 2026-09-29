import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseBenchmarkCase, runBenchmarkCase } from "../../src/benchmark/runner.ts";

import { createMockPi } from "../support/mock-pi.ts";

const corpus = path.resolve(import.meta.dirname, "../../benchmarks/luna-worker-validation");
const roots: string[] = [];
const mocks: ReturnType<typeof createMockPi>[] = [];
afterEach(() => {
	for (const mock of mocks.splice(0)) mock.uninstall();
	for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});
function prepare(id: string) {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), "benchmark-delivery-"));
	roots.push(root);
	const caseDir = path.join(corpus, "cases", id);
	const definition = JSON.parse(fs.readFileSync(path.join(caseDir, "case.json"), "utf8"));
	definition.fixture = path.resolve(caseDir, definition.fixture);
	definition.evaluator.args = definition.evaluator.args.map((arg: string) => arg.replaceAll("{caseDir}", caseDir));
	definition.route = { modelTier: "Offline fixture", model: "fixture/offline", thinkingLevel: "medium" };
	definition.currentPricing = { currency: "USD", unit: "per-million-tokens", effectiveAt: "2026-09-07", source: "https://example.invalid/synthetic-test-rates", input: 0, output: 1, cacheRead: 0, cacheWrite: 0 };
	const casePath = path.join(root, "case.json");
	fs.writeFileSync(casePath, JSON.stringify(definition));
	const mock = createMockPi();
	mocks.push(mock);
	mock.install();
	return { root, casePath, mock, definition };
}
function response(answer: unknown, writeFiles: Array<{ path: string; content: string }> = [], output = 20) {
	return {
		writeFiles,
		sessionEntries: [{ type: "model_change", provider: "fixture", modelId: "offline" }, { type: "thinking_level_change", thinkingLevel: "medium" }],
		jsonl: [{ type: "message_end", message: {
			role: "assistant", model: "fixture/offline", api: "openai-responses", stopReason: "stop",
			content: [{ type: "text", text: typeof answer === "string" ? answer : JSON.stringify(answer) }],
			usageProvenance: { schemaVersion: 1, source: "openai-responses", rawUsage: {
				input_tokens: 100, output_tokens: output, input_tokens_details: { cached_tokens: 10, cache_write_tokens: 0 }, total_tokens: 120,
			} },
		} }],
	};
}
async function run(id: string, answer: unknown, writes: Array<{ path: string; content: string }> = []) {
	const setup = prepare(id);
	setup.mock.onCall(response(answer, writes));
	const result = await runBenchmarkCase({ casePath: setup.casePath, outputDir: path.join(setup.root, "run") });
	const normalized = JSON.parse(fs.readFileSync(result.resultPath, "utf8"));
	const receipt = JSON.parse(fs.readFileSync(result.receiptPath, "utf8"));
	assert.ok(Object.keys(receipt.workspace.before).every((name) => !/evaluator|expectations|case\.json|\.git|SOURCES/.test(name)));
	assert.doesNotMatch(receipt.invocation.args.join("\n"), /expectations\.json|evaluator\.mjs|checks\.mjs/);
	return { ...setup, result, normalized, receipt, evidence: JSON.parse(normalized.evaluation.evidence) };
}
const deadlineFix = `export function launchOptions(params, agent, parentDeadlineAt, now) {
  const result = { ...params };
  if (result.timeoutMs === undefined && result.maxRuntimeMs === undefined) {
    if (agent.defaultTimeoutMs !== undefined) result.timeoutMs = agent.defaultTimeoutMs;
    else if (parentDeadlineAt !== undefined) result.timeoutMs = Math.max(1, parentDeadlineAt - now);
  }
  return result;
}
`;
const recordsOld = '  return records.filter(record => record.state === "completed").map(record => record.artifact);';
const recordsNew = `  if (!Array.isArray(records)) throw new TypeError("records");
  for (const record of records) {
    if (!record || typeof record !== "object" || Array.isArray(record)
      || typeof record.id !== "string" || !record.id.trim()
      || !["running", "completed"].includes(record.state)
      || (record.state === "completed" && (typeof record.artifact !== "string" || !record.artifact.trim()))) throw new TypeError("record");
  }
  return records.filter(record => record.state === "completed").map(record => record.artifact);`;
const boundaryOld = '  if (!result.ok && result.retryable) return fallback();';
const boundaryNew = '  if (!result.ok && result.retryable && !result.mutationAttempted) return fallback();';

const profileFeature = `
export function profileSettings(profiles, profileName) {
  if (!isObject(profiles)) throw new TypeError('profiles');
  if (profileName === undefined) return {};
  const visiting = new Set();
  function resolve(name) {
    if (typeof name !== 'string' || !name.trim() || !Object.hasOwn(profiles, name) || visiting.has(name)) throw new TypeError('profile name or cycle');
    const definition = profiles[name];
    if (!isObject(definition) || !isObject(definition.settings) || Object.keys(definition).some(key => !['settings', 'extends'].includes(key))) throw new TypeError('profile definition');
    visiting.add(name);
    const parent = definition.extends === undefined ? {} : resolve(definition.extends);
    const result = merge(parent, definition.settings);
    visiting.delete(name);
    return result;
  }
  return resolve(profileName);
}
`;
const profileWorkerTests = `import assert from 'node:assert/strict';
import { test } from 'node:test';
import { profileSettings } from './src/schema.mjs';
test('named profile inherits and overrides', () => {
  assert.deepEqual(profileSettings({ a: { settings: { retries: 2 } }, b: { extends: 'a', settings: { timeoutMs: 3 } } }, 'b'), { retries: 2, timeoutMs: 3 });
});
`;
const manifest = JSON.parse(fs.readFileSync(path.join(corpus, 'corpus.json'), 'utf8'));
function reference(id: string) {
 const dir = path.join(corpus, 'fixtures', id);
 const read = (file: string) => fs.readFileSync(path.join(dir, file), 'utf8');
 const write = (file: string, content: string) => ({ path: file, content });
 if (id === 'deadline-preservation') return [write('deadline.mjs', deadlineFix)];
 if (id === 'replay-boundary') return [write('boundary.mjs', read('boundary.mjs').replace(boundaryOld, boundaryNew))];
 if (id === 'record-validation') return [write('records.mjs', read('records.mjs').replace(recordsOld, recordsNew))];
 if (id === 'config-layering') return [
  write('src/schema.mjs', read('src/schema.mjs').replace('if (!value) continue;', 'if (value == null) continue;') + profileFeature),
  write('src/loader.mjs', read('src/loader.mjs').replace('parseInteger }', 'parseInteger, profileSettings }').replace('overrides = {} } = {})', 'overrides = {}, profiles = {}, profileName } = {})').replace('project, environmentLayer(env), profile, overrides', 'project, profileSettings(profiles, profileName), profile, environmentLayer(env), overrides')),
  write('worker.test.mjs', profileWorkerTests),
 ];
 if (id === 'queue-recovery') return [
  write('src/queue.mjs', read('src/queue.mjs').replace('previous.then(task)', 'previous.catch(() => {}).then(task)').replaceAll('tails.delete(key);', 'if (tails.get(key) === current) tails.delete(key);')),
  write('src/service.mjs', read('src/service.mjs').replace('cache.set(key, after);\n      await store.write(key, after);', 'await store.write(key, after);\n      cache.set(key, after);')),
 ];
 return [
  write('src/records.mjs', read('src/records.mjs').replace("    if (record.state !== 'completed') continue;", "    if (!['running', 'completed'].includes(record.state)) throw new TypeError('state');").replace('    seen.add(record.id);', "    seen.add(record.id);\n    if (record.state === 'running') continue;")),
  write('src/publish.mjs', read('src/publish.mjs').replace('  } catch (error) {\n    throw error;', '  } catch (error) {\n    try { await io.rm(staging, { recursive: true, force: true }); } catch {}\n    throw error;')),
 ];
}
function wrong(id: string) {
 const writes = reference(id);
 if (id === 'deadline-preservation') writes[0].content = writes[0].content.replace('result.timeoutMs === undefined', '!result.timeoutMs');
 if (id === 'replay-boundary') writes[0].content = writes[0].content.replace('!result.ok && result.retryable && ', '');
 if (id === 'record-validation') writes[0].content = writes[0].content.replace('!record.id.trim()', '!record.id');
 if (id === 'config-layering') writes[0].content = writes[0].content.replace('value == null', '!value');
 if (id === 'queue-recovery') writes[0].content = writes[0].content.replace('previous.catch(() => {}).then(task)', 'previous.then(task)');
 if (id === 'artifact-pipeline') writes[0].content = writes[0].content.replace("    if (!['running', 'completed'].includes(record.state)) throw new TypeError('state');", "    if (record.state !== 'completed') continue;");
 return writes;
}
describe('offline full-worker corpus', () => {
 it('has six portable standard cases and private host oracles', () => {
  assert.equal(manifest.schemaVersion, 1); assert.equal(manifest.cases.length, 6);
  assert.equal(new Set(manifest.cases.map((x: { id: string }) => x.id)).size, 6);
  for (const entry of manifest.cases) {
   const definition = parseBenchmarkCase(JSON.parse(fs.readFileSync(path.join(corpus, entry.case), 'utf8')));
   assert.equal(definition.agentRole, 'worker'); assert.equal(definition.timeoutMs, 240000);
   assert.equal(definition.mutationPolicy, 'require'); assert.equal(definition.route.thinkingLevel, 'medium');
   assert.equal(definition.evaluator.kind, 'command');
   if (definition.evaluator.kind === 'command') assert.equal(definition.evaluator.requireStructuredVerdict, true);
   assert.equal(definition.currentPricing, undefined);
  }
 });
 it('post-execution scope rejects candidate-generated undeclared files', async () => {
  const writes = reference('deadline-preservation');
  writes[0].content += "\nimport fs from 'node:fs'; fs.writeFileSync(new URL('undeclared.txt', import.meta.url), 'unexpected');\n";
  const result = await run('deadline-preservation', 'Fixed.', writes);
  assert.equal(result.result.passed, false); assert.equal(result.evidence.checks.isolation, false);
 });
 it('queue rejects invalidation of a previously committed cache on failed writes', async () => {
  const writes = reference('queue-recovery');
  const service = writes.find(write => write.path === 'src/service.mjs')!;
  service.content = service.content.replace('await store.write(key, after);', 'try { await store.write(key, after); } catch (error) { cache.delete(key); throw error; }');
  const result = await run('queue-recovery', 'Fixed.', writes);
  assert.equal(result.result.passed, false); assert.equal(result.evidence.checks.visible, true); assert.equal(result.evidence.checks.hidden, false);
 });
 it('config requires worker-authored feature tests', async () => {
  const result = await run('config-layering', 'Implemented.', reference('config-layering').filter(write => write.path !== 'worker.test.mjs'));
  assert.equal(result.result.passed, false); assert.equal(result.evidence.checks.visible, false);
 });
 for (const { id } of manifest.cases) {
  it(`${id}: reference bytes pass; no-op, plausible wrong fix and scope violation fail`, async () => {
   const good = await run(id, 'Implemented and tested.', reference(id));
   assert.equal(good.result.passed, true, good.normalized.evaluation.evidence);
   assert.equal(good.evidence.checks.hidden, true);
   const noop = await run(id, 'Done.'); assert.equal(noop.result.passed, false);
   assert.equal(noop.normalized.mutation.passed, false);
   const bad = await run(id, 'Fixed.', wrong(id)); assert.equal(bad.result.passed, false);
   assert.equal(bad.evidence.checks.visible, true, bad.normalized.evaluation.evidence);
   assert.equal(bad.evidence.checks.hidden, false);
   const scope = await run(id, 'Fixed.', [...reference(id), { path: 'TASK.md', content: 'different task' }]);
   assert.equal(scope.result.passed, false); assert.equal(scope.evidence.checks.isolation, false);
  });
 }
});
