# GPT-6 worker comparison — offline preparation

Update: separate GPT-6 screening allowance approved ($25 hard pre-launch stop,
$15 warning; all three probes + 18 attempts). See [screening operator](OPERATOR.md)
for explicit promotion, frozen runtime/catalog gates and single-ledger execution.
No finalists, escalation or defaults approved. Historical accounting remains separate.
The preparation-only artifact behavior and original design below remain unchanged.

Preparation status: **drafts not launch-authorized**. No runtime, settings, defaults, credentials,
production Routes or existing screening artifacts change. No paid probes/runs.

`matrix.json` records candidate Routes and official API pricing observed
2026-09-28. Qualified Codex IDs are candidates, **not verified installed model
availability**. All use medium Thinking level to isolate the worker model tier;
Luna-high is a separate follow-up, not silently mixed into this comparison.

## Prepared comparisons

| Group | Astra worker | Sol worker | Luna worker |
| --- | --- | --- | --- |
| Worker component | Single worker baseline | Same task and evaluator | Same task and evaluator |
| Orchestrated | Astra parent + Astra worker | Astra parent + Sol worker | Astra parent + Luna worker |

Orchestrated reviewer and optional scout stay Astra-medium in every arm.
Existing rubrics require worker then reviewer; unnecessary scouting fails.
Holding review fixed isolates worker selection. This deliberately does **not**
claim to measure the proposed later optimization of removing routine Astra review.

Cases reuse existing fixtures and hidden checks without model-specific prompt
changes:

- Component screening: deadline precedence and explicit zero handling.
- Component finalist additions: execution replay boundary and malformed records.
- Orchestrated screening: delegation, deadline implementation, integration and review.
- Orchestrated finalist additions: queue ownership and mutation-attempt semantics.

Three repetitions per screening arm/group; finalist validation uses all three
workloads in a group, three repetitions each (nine per arm). This is a design,
not authorization for 18 screening runs or any finalists. Select stages and
approve their cumulative budget explicitly before execution.

### Limits, not manufactured results

1. **All-Astra orchestrated baseline is not a single-agent baseline.** Component
   and orchestrated groups have different fixtures/contracts. Compare arms only
   within a group; do not subtract their times to estimate orchestration overhead.
2. **Luna → Sol escalation is deferred.** Existing workflow rubric demands exactly
   one worker then one reviewer and rejects child failure. Recovery needs its own
   bounded protocol, hidden acceptance checks and complete retry accounting.
3. **Ambiguous/multi-file tasks remain uncovered.** These are reduced bounded
   fixtures, not evidence for repository-scale architecture discovery. Add matched
   cases before making that broader claim.
4. **No new handoff/prompt experiment yet.** Existing parent instructions and
   worker contracts stay fixed. A structured-handoff experiment should compare
   identical Routes separately, not confound model and prompt changes.

## Offline preparation

From repository root; output parent must exist, output itself must not:

```sh
node benchmarks/gpt6-comparison/prepare.mjs /tmp/pi-gpt6-comparison-drafts
```

Writes 18 case drafts and a manifest with candidate Routes, reference prices,
relocated fixture/evaluator paths and SHA-256 source/draft digests. No source
fixtures copied or changed. Output remains tied to this checkout; regenerate
after moving the checkout or changing corpus sources. Digests are preparation
provenance, not an implemented live preflight verifier.

**Drafts intentionally contain `candidateRoute`, not required `route`, and no
`currentPricing`.** Existing runner rejects them before launch. Script has no
launch mode, runtime import, credential access, subprocess or provider calls.
No executable plan is emitted. Tests promote copies only in memory to validate
schema compatibility; they never invoke a model.

## Before any paid execution

- Obtain separate approval for runs and spend; resolve the existing interrupted
  campaign's unknown spend/reservation policy explicitly. A new output folder is
  not a reset of outstanding accounting obligations. Existing evidence remains
  untouched in `benchmarks/screening/` and `docs/research/screening-20260909/`.
- Verify actual selected runtime, Codex availability, exact GPT-6 IDs and medium
  effort mapping. Do not silently substitute GPT-5.6 or a different provider.
- Verify raw per-turn usage provenance, cache-read/write counters, parent and
  child usage, interrupted-call accounting and context. Missing cost is unknown,
  never zero. See [telemetry readiness](../../docs/benchmark-telemetry.md).
- Reverify pricing and record observed date/source for every parent and child.
  Reference rates are Standard API-equivalent USD per million tokens, not Codex
  subscription charges. No fast/regional processing or paid hosted tools assumed.
  Above 272K input, official prices change; fixed rates must not price those runs.
  Existing 100K typical / 150K Tail breach policy remains unchanged.
- Add or select a reviewed **workflow-arm-aware** aggregation/scheduling layer
  with one cumulative spend ledger. `src/benchmark/suite.ts` currently groups by
  parent Agent role/model/Thinking level, ignoring child Routes. Combining these
  arms would merge unlike workflows; separate plans would reset budget accounting.
  Do neither to manufacture valid screening. Do not falsify `modelTier` labels.
- Freeze fixtures, prompts, evaluators and role contracts; balance/interleave arm
  order. All original corpus hidden acceptance checks must pass. Report failures,
  blocked runs and missing telemetry separately; no unrecorded repair retries.
- Only then promote reviewed drafts to actual `route` and complete
  `currentPricing`, preserving per-child prices and source evidence.

## Decision evidence

Within each group/arm report acceptance rate, total Benchmark cost including
failed attempts, cost per accepted result (unavailable if none), end-to-end wall
clock, cumulative output, Peak context load and Tail breaches. For workflows,
retain parent/worker/reviewer cost and time components. Three screening samples
are preliminary evidence, not a reliable tail-latency estimate.

A cheaper token rate is not a quality win. Advance Luna only when independent
acceptance and context gates hold; expand to harder workloads before changing
production defaults. Keep Sol as an unproven escalation candidate until recovery
is actually tested. No numerical Quality floor or production policy is approved
by this preparation.

## Pricing sources

- [GPT-6 Astra](https://developers.openai.com/api/docs/models/gpt-6-astra): input $10, output $50, cache read $1, cache write $12.50.
- [GPT-6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol): input $2, output $10, cache read $0.20, cache write $2.50.
- [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna): input $0.10, output $0.50, cache read $0.01, cache write $0.125.
- [Model-selection guidance](https://developers.openai.com/api/docs/guides/model-selection): scoped Luna work versus ambiguous Astra work is guidance, not local benchmark evidence.

## Validation

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  --test test/integration/benchmark-gpt6-preparation.test.ts
npm run typecheck
```
