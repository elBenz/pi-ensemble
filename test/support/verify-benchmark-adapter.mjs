import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runBenchmarkPlan } from '../../src/benchmark/suite.ts';
import { createMockPi } from './mock-pi.ts';

// Explicit offline cross-repository check; never included in automatic paid/E2E runs.
const checkout = process.argv[2];
if (!checkout) throw new Error('Usage: node --experimental-strip-types --import ./test/support/register-loader.mjs test/support/verify-benchmark-adapter.mjs <patched-pi-checkout>');
const { stream } = await import(pathToFileURL(path.resolve(checkout, 'packages/ai/src/api/openai-codex-responses.ts')).href);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-provenance-pipeline-'));
const mock = createMockPi();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Network forbidden in adapter pipeline test'); };
try {
  const model = { id: 'gpt-5.6-luna', name: 'Test', api: 'openai-codex-responses', provider: 'openai-codex', baseUrl: 'https://example.invalid', reasoning: true, input: ['text'], cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 3 }, contextWindow: 272000, maxTokens: 1000 };
  const token = `test.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'test' } })).toString('base64')}.test`;
  const rawTurns = [
    { input_tokens: 20, output_tokens: 5, input_tokens_details: { cached_tokens: 2, cache_write_tokens: 3 }, total_tokens: 25 },
    { output_tokens: 5, input_tokens_details: { cached_tokens: 2, cache_write_tokens: 3 }, total_tokens: 25 },
  ];
  mock.install();
  for (const rawUsage of rawTurns) {
    const events = [
      { type: 'response.output_item.added', output_index: 0, item: { type: 'message', id: 'msg_test', role: 'assistant', content: [] } },
      { type: 'response.output_text.delta', output_index: 0, delta: 'done' },
      { type: 'response.completed', response: { id: 'resp_test', status: 'completed', output: [], usage: rawUsage } },
    ];
    const data = events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
    const result = await stream(model, { messages: [{ role: 'user', content: 'test', timestamp: 0 }] }, { apiKey: token, transport: 'sse', fetch: async () => new Response(data, { status: 200, headers: { 'content-type': 'text/event-stream' } }) }).result();
    assert.equal(result.stopReason, 'stop');
    assert.deepEqual(result.usageProvenance?.rawUsage, rawUsage);
    mock.onCall({ jsonl: [{ type: 'message_end', message: result }], sessionEntries: [{ type: 'model_change', provider: 'openai-codex', modelId: model.id }, { type: 'thinking_level_change', thinkingLevel: 'low' }] });
  }
  fs.writeFileSync(path.join(root, 'case.json'), JSON.stringify({ id: 'pipeline', agentRole: 'scout', route: { modelTier: 'Test', model: 'openai-codex/gpt-5.6-luna', thinkingLevel: 'low' }, currentPricing: { currency: 'USD', unit: 'per-million-tokens', effectiveAt: '2026-09-07', source: 'https://example.invalid/pricing', ...model.cost }, prompt: 'done', evaluator: { kind: 'output-includes', expected: 'done' }, timeoutMs: 2000, mutationPolicy: 'forbid' }));
  fs.writeFileSync(path.join(root, 'plan.json'), JSON.stringify({ id: 'pipeline', stage: 'screening', launches: [{ case: 'case.json', repetitions: 3 }] }));
  const completed = await runBenchmarkPlan({ planPath: path.join(root, 'plan.json'), outputDir: path.join(root, 'result') });
  assert.equal(completed.blocked, true);
  assert.equal(mock.callCount(), 2);
  const result = JSON.parse(fs.readFileSync(completed.resultPath, 'utf8'));
  assert.equal(result.budget.knownSpend, 0.000035);
  assert.equal(result.budget.cumulativeSpend, null);
  const receipt = JSON.parse(fs.readFileSync(path.join(root, 'result/run-002/receipt.json'), 'utf8'));
  assert.deepEqual(JSON.parse(receipt.candidate.stdout).message.usageProvenance.rawUsage, rawTurns[1]);
  console.log('PASS: mocked Codex SSE -> actual patched adapter -> serialized Pi messages -> fake Pi process -> plan; known spend retained, missing raw input blocks third launch. Network forbidden.');
} finally {
  globalThis.fetch = originalFetch;
  mock.uninstall();
  fs.rmSync(root, { recursive: true, force: true });
}
