import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { runBenchmarkPlan } from '../../src/benchmark/suite.ts';

// elBenz/pi-ensemble#12: explicit offline CLI check, never an automatic provider run.
const cli = process.argv[2] && fs.realpathSync(process.argv[2]);
if (!cli) throw new Error('Usage: node --experimental-strip-types --import ./test/support/register-loader.mjs test/support/verify-benchmark-cli.mjs <pi-cli>');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-provenance-cli-'));
const agentDir = path.join(root, 'agent');
fs.mkdirSync(agentDir);
const env = {
  PATH: `${path.dirname(process.execPath)}${path.delimiter}/usr/bin${path.delimiter}/bin`,
  HOME: root,
  TMPDIR: root,
  PI_CODING_AGENT_DIR: agentDir,
  PI_OFFLINE: '1',
  PI_SKIP_VERSION_CHECK: '1',
  PI_TELEMETRY: '0',
  PI_SUBAGENT_PI_BINARY: cli,
};
const rawTurns = [
  { input_tokens: 20, output_tokens: 5, input_tokens_details: { cached_tokens: 2, cache_write_tokens: 3 }, total_tokens: 25 },
  { output_tokens: 5, input_tokens_details: { cached_tokens: 2, cache_write_tokens: 3 }, total_tokens: 25 },
];
let requests = 0;
let turns = [rawTurns[0]];
const server = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  requests += 1;
  const rawUsage = turns.shift();
  if (request.method !== 'POST' || request.url !== '/v1/responses' || !rawUsage) {
    response.writeHead(400).end('Unexpected fixture request');
    return;
  }
  const body = JSON.parse(Buffer.concat(chunks).toString());
  if (body.model !== 'provenance-fixture' || body.stream !== true) {
    response.writeHead(400).end('Unexpected fixture model or transport');
    return;
  }
  const events = [
    { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_test', role: 'assistant', content: [] } },
    { type: 'response.output_text.delta', output_index: 0, content_index: 0, delta: 'done' },
    { type: 'response.completed', response: { id: 'resp_test', status: 'completed', output: [], usage: rawUsage } },
  ];
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.end(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''));
});
const jsonLines = text => text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value));
let passed = false;
try {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const cost = { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 3 };
  writeJson(path.join(agentDir, 'models.json'), { providers: { 'offline-fixture': {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, api: 'openai-responses', apiKey: 'offline-placeholder',
    models: [{ id: 'provenance-fixture', cost, contextWindow: 128000, maxTokens: 1000 }],
  } } });
  writeJson(path.join(agentDir, 'settings.json'), { compaction: { enabled: false }, retry: { enabled: false } });
  const execute = (command, args, options) => {
    const pending = promisify(execFile)(command, args, options);
    pending.child.stdin.end();
    return pending;
  };
  const version = await execute(cli, ['--version'], { cwd: root, env, timeout: 30000 });
  const sessionPath = path.join(root, 'session.jsonl');
  const { stdout, stderr } = await execute(cli, [
    '--offline', '--mode', 'json', '--session', sessionPath,
    '--provider', 'offline-fixture', '--model', 'provenance-fixture', '--thinking', 'off',
    '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-themes', '--no-context-files',
    '--no-tools', '--no-approve', '-p', 'Reply done',
  ], { cwd: root, env, timeout: 30000, maxBuffer: 1024 * 1024 });
  fs.writeFileSync(path.join(root, 'stdout.jsonl'), stdout);
  fs.writeFileSync(path.join(root, 'stderr.txt'), stderr);
  const events = jsonLines(stdout);
  const terminal = events.find(event => event.type === 'message_end' && event.message.role === 'assistant')?.message;
  assert.equal(terminal?.stopReason, 'stop');
  assert.deepEqual(terminal.usageProvenance, { schemaVersion: 1, source: 'openai-responses', rawUsage: rawTurns[0] });
  const saved = jsonLines(fs.readFileSync(sessionPath, 'utf8')).find(event => event.type === 'message' && event.message.role === 'assistant')?.message;
  assert.deepEqual(saved, terminal, 'Session persistence must retain the authoritative CLI message');
  assert.deepEqual(events.find(event => event.type === 'agent_end')?.messages.find(message => message.role === 'assistant'), terminal);
  assert.equal(requests, 1);
  console.log(`PASS: ${cli} (${version.stdout.trim()}): loopback SSE -> bundled adapter -> CLI JSON and persisted session`);

  turns = [...rawTurns];
  writeJson(path.join(root, 'case.json'), {
    id: 'cli-provenance', agentRole: 'scout',
    route: { modelTier: 'Fixture', model: 'offline-fixture/provenance-fixture', thinkingLevel: 'off' },
    currentPricing: { currency: 'USD', unit: 'per-million-tokens', effectiveAt: '2026-09-07', source: 'https://example.invalid/fixture-pricing', ...cost },
    prompt: 'Reply done', evaluator: { kind: 'output-includes', expected: 'done' }, timeoutMs: 30000, mutationPolicy: 'forbid',
  });
  writeJson(path.join(root, 'plan.json'), { id: 'cli-provenance', stage: 'screening', launches: [{ case: 'case.json', repetitions: 3 }] });
  const completed = await runBenchmarkPlan({ planPath: path.join(root, 'plan.json'), outputDir: path.join(root, 'result'), env });
  const result = readJson(completed.resultPath);
  assert.equal(completed.blocked, true);
  assert.equal(result.completedLaunches, 2);
  assert.equal(requests, 3, 'Unknown cost must prevent the third plan provider request');
  assert.equal(result.budget.knownSpend, 0.000035);
  assert.equal(result.budget.cumulativeSpend, null);
  for (let index = 0; index < 2; index += 1) {
    const runDir = path.join(root, 'result', `run-00${index + 1}`);
    const receipt = readJson(path.join(runDir, 'receipt.json'));
    assert.equal(receipt.invocation.command, cli);
    assert.equal(receipt.candidate.exitCode, 0);
    assert.equal(receipt.candidate.timedOut, false);
    assert.equal(receipt.resolved.model, 'offline-fixture/provenance-fixture');
    assert.equal(receipt.resolved.thinkingLevel, 'off');
    assert.deepEqual(receipt.workspace.changedFiles, []);
    const message = jsonLines(receipt.candidate.stdout).find(event => event.type === 'message_end' && event.message.role === 'assistant').message;
    assert.deepEqual(message.usageProvenance.rawUsage, rawTurns[index]);
    const persisted = jsonLines(fs.readFileSync(path.join(runDir, 'session.jsonl'), 'utf8')).find(event => event.type === 'message' && event.message.role === 'assistant').message;
    assert.deepEqual(persisted.usageProvenance, message.usageProvenance);
    const runResult = readJson(path.join(runDir, 'result.json'));
    assert.equal(runResult.schemaVersion, 4);
    assert.equal(runResult.passed, index === 0);
    assert.equal(runResult.evaluation.passed, true, 'Unknown pricing must not erase completed evaluation');
    assert.equal(fs.statSync(path.join(runDir, 'receipt.json')).mode & 0o222, 0);
  }
  console.log('PASS: actual CLI selected through PI_SUBAGENT_PI_BINARY -> plan; known spend retained, omitted raw input blocks third launch; immutable receipts and route preserved. Synthetic fixtures only.');
  passed = true;
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  if (passed) fs.rmSync(root, { recursive: true, force: true });
  else console.error(`Failure artifacts: ${root}`);
}
