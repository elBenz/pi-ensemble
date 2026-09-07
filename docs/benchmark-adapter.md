# Responses usage provenance adapter

Issue: https://github.com/elBenz/pi-ensemble/issues/12

## Status

Source integration implemented, **built locally and validated through the real bundled CLI offline**. [Final #12 acceptance and review](benchmark-acceptance.md) confirm the bounded implementation; campaign readiness remains separate. The local executable was selected through `PI_SUBAGENT_PI_BINARY` only inside the isolated validation environment. Not globally installed, published, or selected for ordinary sessions/campaigns. Stock Pi 0.85.1 still lacks this capture; schema-v4 benchmark results now reject its unproven usage instead of pricing adapter-inserted zeros. Other API families without this provenance contract also fail closed. This is an intentional compatibility change, not a campaign-ready release.

Local source checkout: `$HOME/SideProjects/pi-telemetry-adapter`. Base: `earendil-works/pi` tag `v0.85.1`, commit `d981de1229ef899957bbe968bc8dcda02a21f477`. Source changes are committed locally at `f4edad2c2f15afc7faf18cd22142a1f198a337f6` and preserved in [the portable patch](patches/pi-0.85.1-usage-provenance.patch), including adapter regression tests. The patch still applies to the pinned base above; the local checkout already contains it. No global package or routing settings changed.

## Contract

The shared OpenAI Responses parser snapshots `response.usage` before normalization into terminal `AssistantMessage.usageProvenance`:

```json
{
  "schemaVersion": 1,
  "source": "openai-responses",
  "rawUsage": {
    "input_tokens": 20,
    "output_tokens": 5,
    "input_tokens_details": { "cached_tokens": 2, "cache_write_tokens": 3 },
    "total_tokens": 25
  }
}
```

This is a new Pi-side envelope, **not an invented provider field**. Existing numeric `Usage` stays unchanged. Snapshot is detached from provider and normalized objects; omitted, malformed and explicit-zero fields remain distinguishable. Missing/null usage produces `rawUsage: null`. Completed/incomplete Responses events use this path; failed, aborted, or unclosed responses remain unavailable to benchmark repricing.

Runner accepts envelope v1 only for `openai-responses`, `openai-codex-responses`, and `azure-openai-responses`. It derives uncached input by subtracting cache reads/writes from raw input (which includes both), never by clamping an inconsistent negative count to zero. All required counters must be finite and nonnegative. Missing cache fields—including `cache_write_tokens`—remain unknown, even if a particular model usually omits them; there is no undocumented absent-means-zero rule. Optional reasoning stays unknown when absent and is not charged twice. Raw `total_tokens`, or the sum of complete categories when absent, supplies context evidence.

Raw envelope stays in immutable stdout receipts. No request payloads, auth tokens or headers are added to capture. Historical `usage.cost.total` remains a separate Pi-reported estimate, not a provider invoice. Envelope validation assumes the selected Pi executable is trusted; it is not a cryptographic attestation of provider traffic.

## Reproduce without provider requests

Apply only to a clean checkout at the pinned base (the local checkout above already has the patch):

```sh
# From a fresh earendil-works/pi checkout at d981de1229ef899957bbe968bc8dcda02a21f477:
git apply --check /path/to/pi-ensemble/docs/patches/pi-0.85.1-usage-provenance.patch
git apply /path/to/pi-ensemble/docs/patches/pi-0.85.1-usage-provenance.patch
npm ci --ignore-scripts
cd packages/ai
node ../../node_modules/vitest/dist/cli.js --run \
  test/openai-responses-usage-provenance.test.ts \
  test/openai-responses-terminal-event.test.ts \
  test/azure-openai-responses-reasoning-replay.test.ts \
  test/openai-responses-partial-json-cleanup.test.ts \
  test/openai-codex-stream.test.ts
```

From the pi-ensemble checkout, verify the complete offline pipeline:

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  test/support/verify-benchmark-adapter.mjs /path/to/patched-pi-checkout
```

Pipeline uses mocked Codex SSE, the actual patched adapter, serialized assistant messages, fake Pi processes, and `runBenchmarkPlan`. It retains known spend and raw receipts, then blocks the third launch after provider input is omitted. Global fetch throws if unexpected networking is attempted. It does not run the real Pi CLI, authenticate, or prove live provider reporting.

## Local runtime build and CLI validation

With explicit user authorization, the existing checkout was hydrated and built using upstream scripts:

```sh
cd /path/to/patched-pi-checkout
npm run hydrate:model-data
npm run check:model-data
npm run check
npm run build:offline
```

Hydration fetched public model metadata from models.dev, NVIDIA NIM, OpenRouter and Vercel AI Gateway; it made no inference requests. `--data-only` wrote ignored checkout-local `packages/ai/src/providers/data/` JSON without changing tracked model catalog source, dependency metadata or global catalogs. This resolved the missing-data check failure; full upstream checks and the offline build then passed. Hydrated metadata reflects retrieval time, not an immutable catalog from the source tag.

Run the real-CLI validation from pi-ensemble:

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  test/support/verify-benchmark-cli.mjs \
  /path/to/patched-pi-checkout/packages/coding-agent/dist/bundle/cli.js
```

This script runs the actual package `bin.pi` bundle, not a fake process or rewritten bundle. A loopback HTTP server emits synthetic Responses SSE. The child receives an allowlisted environment, temporary HOME/config, dummy auth and `PI_OFFLINE=1`; extension discovery and other ambient resources are disabled. No real credentials are inherited. This is configuration isolation, not an OS network sandbox. Only the benchmark's explicit telemetry extension loads during plan validation.

Assertions cover CLI `message_end`/`agent_end`, persisted session provenance, and the public `runBenchmarkPlan` path using the actual executable through `PI_SUBAGENT_PI_BINARY`. A complete fixture costs $0.000035 at synthetic rates; the next fixture omits raw input, preserving unknown usage and blocking the third launch while retaining known spend, completed evaluation, route resolution and read-only receipts. Passing runs remove temporary artifacts; failures retain them and print their path.

Verified executable: `$HOME/SideProjects/pi-telemetry-adapter/packages/coding-agent/dist/bundle/cli.js`, version `0.85.1`. The same check against global stock 0.85.1 failed specifically because terminal `usageProvenance` was absent. Both CLI/session forwarding and benchmark-plan assertions pass with the patched bundle. Real CLI coverage uses `openai-responses`; Codex SSE remains covered by the adapter-level pipeline above, not a real Codex CLI/authentication run. Synthetic cache-write fixtures do not establish live provider support.

For a separately authorized invocation, select this exact local executable using `PI_SUBAGENT_PI_BINARY`; do not overwrite global Pi or change global defaults. No persistent activation occurred. Paid validation still requires separate approval.

## Compute acceptance reconciled; capture remains unsupported

Research found no verified per-turn compute-unit field in the Responses schema or subscribed Codex transport. [Official Astra pricing](https://developers.openai.com/api/docs/models/gpt-6-astra), checked 2026-09-07, states per-million-token input/cached-input/cache-write/output rates ($10/$1/$12.50/$50), plus mode/context/tool caveats. It does not establish a separate compute-unit response field. The [official Responses schema](https://platform.openai.com/docs/static/api-definition.yaml) likewise does not establish one.

The user explicitly approved [capability-based acceptance](research/compute-acceptance-reconciliation.md) on 2026-09-07. #12 now requires explicit unsupported compute telemetry and preflight rejection of compute-priced live cases until a documented field, verified adapter mapping and deterministic fixtures exist. Related wording in #9/#17 was updated; no original context/spend criteria were removed or marked complete. Do not derive compute units from reasoning tokens or DeepSWE aggregate charges. `computeUnit` live pricing remains rejected before launch; offline importer behavior is unchanged.

This revision does not establish live priceability: the fetched Responses schema also did not verify the cache-write counter used by synthetic fixtures. Missing required cache-write data remains unknown and blocks subsequent launches. Final validation/review supports bounded #12 completion; [acceptance evidence](benchmark-acceptance.md) records existing repository validation debt separately under #6. #17 remains gated on actual runtime/model/effort/fallback/auth verification, live counter availability and explicit campaign/spend approval.

## Validation

Latest completion pass: typecheck passed; two full unit runs each passed 2119 tests with 3 skips; integration passed 697 with one freshly baseline-reproduced ambient-settings failure, which passes with an isolated agent directory. E2E still executed zero tests. Adapter's 63 tests and both offline pipelines passed again. Fresh two-axis review found no implementation blockers. Full details and deferred validation debt: [completion evidence](benchmark-acceptance.md). Earlier checkpoints follow.

- Adapter TDD: nine original assertions failed before the patch (missing provenance), then passed. Added Codex SSE serialization coverage; five focused files now pass **63 tests**.
- Runner TDD: old normalized zeros produced `$0` instead of unavailable; then a raw omitted input still produced `$0` despite a valid envelope. Both regressions passed after their respective fixes.
- pi-ensemble: **24 focused integrations passed**, typecheck passed. Cross-repository offline pipeline passed. Patch reverse-application check passed against the modified checkout.
- Initially, upstream `npm run check` stopped at missing generated model data. After authorized hydration: `check:model-data`, full `npm run check` (including typecheck/browser smoke), and `npm run build:offline` all passed. No upstream source edits were needed in this continuation.
- Real CLI negative control: stock 0.85.1 failed the provenance assertion (`undefined`); patched 0.85.1 passed CLI/session and actual-CLI plan validation. Repeated after adding schema-v4, evaluation and persisted omitted-input assertions: passed. Parent typecheck, 24 focused integrations, 63 adapter tests and the existing Codex pipeline were rerun and passed.
- Pre-handoff targeted failure checks: `orca-progress-tabs.test.ts` passed in isolation (14 passed, 1 Windows-only skip); this does not disprove its earlier concurrent-suite cleanup failure. The single `uses request cwd for execution-time agent discovery` integration still fails at `fork-context-execution.test.ts:1162` (`true` versus `undefined`). Logs: `/tmp/pi-ensemble-12-next-orca.log`, `/tmp/pi-ensemble-12-next-fork.log`. No fresh baseline comparison or unrelated code repair performed.
- Prior pi-ensemble full suites (not rerun during local build/CLI validation): unit **2119 passed, 1 failed, 3 skipped** (`orca-progress-tabs.test.ts`, temporary-root cleanup `ENOTEMPTY`); integration **697 passed, 1 failed** (previously documented `fork-context-execution.test.ts:1162` assertion). No fresh baseline verification. E2E exited 0 but ran zero tests because runtime-package gate skipped it. Full suites are not green.
