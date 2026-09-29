# Authorized GPT-6 screening operator

New, separate **$25 allowance; $15 warning** covers three delegate probes and 18
screening attempts, including every parent/child and failed attempt. No finalists,
escalation, production defaults or historical continuation. Development overhead is
outside this benchmark ledger. Historical original campaign stays unchanged:
known $1.729328; assumption-dependent reservation $16.40; charge $18.129328;
measured total unknown. None counts against this new allowance.

`prepare.mjs` still creates unlaunchable drafts. `campaign.mjs` explicitly promotes
only six screening cases, adds three cheap probes, freezes source/case/config/runtime
inputs (including fixture directory membership/types) and schedules three Latin-rotated repetitions per group/worker tier.
Parent/reviewer/scout stay Astra-medium. Aggregation keys include group AND worker
arm; never use stock suite grouping for these workflows.

## Gate interface

Parent supplies isolated patched CLI, agent directory, actual offline CLI listing,
and independently verified dated pricing. No credentials copied or printed.
`campaign.mjs` exports `runtimeDigest(binary)`, `validateGates(gates)`,
`prepare(newOutput, drafts, gatesPath)`, `execute(output, 'probe' | 'run')`,
`ledger(output)`, `schedule()` and mock-only `executeOffline`.

Gate JSON:

```js
{
  schemaVersion: 1,
  transport: 'sse',
  usageProvenance: true, // prerequisite verified by offline adapter test
  runtime: { binary: '/absolute/real/path/cli.js', sha256: runtimeDigest(binary) },
  agentDir: '/absolute/isolated/agent',
  settingsSha256: sha256(settingsJsonBytes),
  modelsSha256: sha256(modelsJsonBytes),
  modelsStoreSha256: sha256(modelsStoreJsonBytes),
  catalogListing: { path: '/absolute/listing.txt', sha256: sha256(listingBytes) },
  checks: [ // one for each astra, sol, luna
    { query: 'openai-codex/gpt-6-astra:medium',
      resolved: 'openai-codex/gpt-6-astra:medium', effortSupported: true }
  ],
  pricingVerifiedAt: '2026-09-28',
  pricing: { astra: matrix.models.astra.pricingReference,
             sol: matrix.models.sol.pricingReference,
             luna: matrix.models.luna.pricingReference }
}
```

`sha256` is ordinary file-byte SHA-256. Gate generation does not read auth. The
operator requires Codex-only `models.json` overlay: exact IDs, Codex Responses API,
medium→medium mapping, reasoning enabled, 272000 context, exact four price counters.
Old runtime source registry need not contain new IDs. Before **each launch**, actual
isolated `node CLI --list-models openai-codex` stdout must exactly match saved listing.
`models-store.json` is allowed but frozen (normally `{}`). Runtime digest covers CLI
containing directory tree; source dependency hashes cover all `src`, role contracts,
operator files, test-loader dependencies, package/lock, entrypoints and draft corpus.

Required settings: `transport:'sse'`, install telemetry/analytics disabled,
`compaction.enabled:false`, `retry.enabled:false`, `retry.maxRetries:0`,
`retry.provider.maxRetries:0`, empty packages/extensions/skills/prompts/themes,
`enableSkillCommands:false`, `defaultProjectTrust:'never'`.
Only auth/settings/models/models-store and runtime sessions allowed in isolated dir.
Auth provider names checked only at execution; secrets never enter output.

## Invocation

From checkout, Node with existing TS loader:

```sh
node benchmarks/gpt6-comparison/prepare.mjs /tmp/gpt6-drafts
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  benchmarks/gpt6-comparison/campaign.mjs prepare /tmp/gpt6-campaign /tmp/gpt6-drafts /tmp/gpt6-gates.json
# Paid-capable: parent/operator only, after offline review.
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  benchmarks/gpt6-comparison/campaign.mjs probe /tmp/gpt6-campaign
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  benchmarks/gpt6-comparison/campaign.mjs run /tmp/gpt6-campaign
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  benchmarks/gpt6-comparison/campaign.mjs ledger /tmp/gpt6-campaign
```

One approved campaign directory only. Never generate another to reset allowance.
Exclusive lock + durable launch markers precede public runner calls. Receipt/result
seals retain complete attempts. Throws, interruptions, unknown usage, raw accounting
mismatches, unsupported >272k input pricing, failed probes or source drift stop
execution. No retries or reservation for new unknown spend. Existing completed
attempts are skipped only when seals and accounting verify. Missing artifacts never
mean unlaunched. A stale lock requires manual review, not automatic deletion.

Ledger independently prices every raw parent/child terminal turn, checks complete
model/effort evidence, usage provenance and result per-turn totals. Failed task
attempts with complete usage remain charged; transport/process failures are separate
from acceptance. Reports retain component costs/process wall times, observed whole
runner wall time, acceptance rates, cost per accepted result (null with none), output,
peak context and tail breaches. Unknown accounting stays unknown, not zero: remaining allowance and affected Tail breach totals are null. Fully charged terminal rejected workflow actions remain priceable even when no child launches.
SSE is prospective choice: **no historical speed-comparison claim**.

Budget is a **pre-launch threshold**, not guaranteed provider ceiling. Runner receives
remaining allowance and gates child launches too; an in-flight call can overshoot.
All overshoot is charged and further launches stop. Published API-equivalent prices
are not subscription billing. Three samples are preliminary, not tail-latency proof.

## Offline validation

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  --test test/integration/benchmark-gpt6-campaign.test.ts test/integration/benchmark-gpt6-preparation.test.ts
npm run typecheck
```

Tests supply fake public-runner receipts only; no provider calls or real CLI launches.
