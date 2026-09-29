# Luna full-worker carry-forward validation

New campaign only. Prior GPT-6 screening files remain immutable. No inference during
preparation. Parent approval required before live probe/run; credentials never copied.

## Interface

Run from repository root using Node with TypeScript stripping:

```sh
node --experimental-strip-types benchmarks/luna-worker-validation/campaign.mjs prepare NEW_OUTPUT CORPUS_ROOT GATES_JSON APPROVAL_JSON
node --experimental-strip-types benchmarks/luna-worker-validation/campaign.mjs ledger NEW_OUTPUT
node --experimental-strip-types benchmarks/luna-worker-validation/campaign.mjs probe NEW_OUTPUT
node --experimental-strip-types benchmarks/luna-worker-validation/campaign.mjs run NEW_OUTPUT
```

`NEW_OUTPUT` must not exist. Approval explicitly pins reviewed prior archive and
ledger bytes; paths absolute, hashes SHA-256:

```json
{
  "archive": { "path": "/absolute/docs/research/gpt6-screening-20260928/artifacts.json.gz", "sha256": "REVIEWED_ARCHIVE_SHA256" },
  "ledger": { "path": "/absolute/docs/research/gpt6-screening-20260928/ledger.json", "sha256": "REVIEWED_LEDGER_SHA256" }
}
```

Audit recomputes every prior raw receipt with exact published API prices, verifies
case/launch/completion/public-input digests, reconciles ledger results and totals,
and requires complete original 21-attempt schedule. No `initialSpend` input.
Reviewed archive yields measured $1.6611027, conservative charge $1.661103,
remaining $23.338897. Older $18.129328 campaign stays separate, never subtracted.
Archive and ledger remain pinned in new manifest provenance; keep them accessible.

Gates use prior operator schema plus exact successful
`openai-codex/gpt-6-luna:high` check. Runtime, settings, models overlay/store, pricing,
and catalog-listing reference must equal archived gates for medium-probe reuse.
Luna overlay must map high to high. No edits to inherited config permitted.
SSE, disabled retries/compaction/telemetry/extensions, isolated Codex-only config,
and exact runtime digest required. Parent restores auth temporarily in approved
agent directory (`/private/tmp/pi-gpt6-live.hXFZeN/agent`); preparation never reads auth.
Live preflight checks provider names and actual CLI catalog before every launch.

Corpus root contains `corpus.json`: schemaVersion 1, six entries
`{id, case: "cases/<id>/case.json", kind}`. IDs: deadline-preservation,
replay-boundary, record-validation, config-layering, queue-recovery, artifact-pipeline.
Each case uses public runner schema, `agentRole: "worker"`, fixture, evaluator,
no workflow. Relative fixture resolved against case directory; `{caseDir}` in
evaluator args expanded. Keep evaluator dependency trees inside corpus. Operator
changes only case ID, route and currentPricing across arms; all task content shared.
Sources, corpus, fixtures, runtime and inventories (including empty directories)
freeze at preparation. Finish corpus/operator edits before preparing real output.

## Execution and interpretation

One cheap Luna-high probe precedes 54 fresh worker attempts: six tasks × three arms
(Luna-medium, Luna-high, Sol-medium) × three repetitions. Latin arm rotation,
sequential execution, new public-runner output/session per attempt. Prior successful
medium probes reused only under identical frozen runtime/config/pricing.

Single cumulative $25 allowance includes all prior screening, new probe and workers.
Warning at cumulative $15. No reservations; launch only below $25, charge full
in-flight cost even if it crosses cap. Thus hard cap is pre-launch, not a guarantee
against single-attempt overshoot. Public runner receives remaining allowance.

Launch and completion markers are exclusive-create, fsynced, digest-linked. Never
remove locks/markers or retry failed paid attempts. Unknown usage, interrupted launch,
stale lock or failed probe blocks campaign; manual review required. Quality failures
with complete accounting remain paid attempts and do not block subsequent scheduled
attempts. Missing totals/context metrics remain null, never inferred as zero.

Ledger reports task+arm and overall-arm acceptance, total and accepted-only cost,
cost per accepted (all attempt cost / accepted count), median wall time, cumulative
output, peak context and >150k tail breaches. Probe cost included in allowance but
excluded from worker groups. Raw public-runner artifacts retained alongside seals.
No production routing change or deployment recommendation implied.

## Offline checks

```sh
node --experimental-strip-types --test test/integration/benchmark-luna-campaign.test.ts
```

Private fake corpus/runtime, synthetic raw usage; no inference, auth access or global
configuration edits. Tests also audit archived real raw receipts offline.
