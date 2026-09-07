# Issue #12 completion evidence

Status: [#12 closed](https://github.com/elBenz/pi-ensemble/issues/12) on 2026-09-07 after validation and review of the **locally complete bounded context/spend and usage-provenance implementation**. This is not publication, ordinary-session activation, live priceability, or campaign authorization. After closure, the user explicitly authorized local commits of the reviewed carried-forward changes in both checkouts. No push was requested. Upstream adapter commit: `f4edad2c2f15afc7faf18cd22142a1f198a337f6`; this document accompanies the parent integration commit.

Spec: [#12](https://github.com/elBenz/pi-ensemble/issues/12), including the [explicitly approved compute reconciliation](research/compute-acceptance-reconciliation.md). Runtime contract, portable patch, build history and repeatable offline commands: [benchmark adapter](benchmark-adapter.md).

## Acceptance mapping

| Requirement | Evidence |
| --- | --- |
| Peak context is maximum per-turn total, not cumulative usage | `test/integration/benchmark-runner.test.ts` two-turn fixture asserts peak 155, cumulative input 170, output 35; telemetry regressions retain unknown context and proven Tail breaches. Compute remains a separate unsupported metric. |
| Comparable typical context, 100k eligibility, >150k Tail breaches and nine-run finalist rejection | `test/unit/benchmark-policy.test.ts` checks median, exact boundaries and two breaches among nine runs; `test/integration/benchmark-policy-runner.test.ts` checks comparable repetitions and incomplete context. |
| Auditable current repricing distinct from historical cost | Runner tests assert pricing provenance, cache-category subtraction, separate historical estimate and no reasoning double-charge; malformed pricing fails preflight. |
| Inclusive screening $15/$25 and finalist $30/$50 gates | Policy tests cover all four boundaries; plan tests prove next-launch blocking at $25 and after a completed mutation crosses the limit. |
| Preserve mutation completion, receipts and known spend | Plan regressions retain workspace edits, completed evaluation and raw receipts after missing usage; cumulative spend becomes unknown while prior known spend remains visible. |
| Raw supported usage before normalization; explicit zero versus omission | Patched Pi 0.85.1 shared Responses parser snapshots raw usage. Five focused adapter files pass 63 tests; runner telemetry tests reject missing, malformed, partial and unsupported provenance. |
| Unsupported compute fails closed | Live compute-priced cases reject before spawn with zero launches. No reasoning-to-compute inference. External-import compute support/tests remain unchanged. |
| Actual runtime forwarding and public runner/plan integration | `test/support/verify-benchmark-cli.mjs` passes loopback Responses SSE through the actual bundled CLI, JSON events, persisted sessions and `runBenchmarkPlan`. Synthetic complete usage costs $0.000035; omitted raw input blocks the third launch and retains known spend. Separate mocked Codex SSE pipeline passes through the actual adapter and fake Pi process. |

The final #12 checklist item is explicitly **before paid screening**, not evidence of a campaign already completed. Actual model/effort/fallback/auth verification, live counter availability, runtime selection and spend authorization remain launch prerequisites in [#17](https://github.com/elBenz/pi-ensemble/issues/17). Unsupported required counters remain unknown, including cache writes; the implementation never substitutes synthetic fixtures for provider evidence.

## Final validation

No implementation source changed during this completion pass. Parent fixed point: `b8a619bb3790ef00482a4baf50c6287def508c05`; external Pi fixed point: `d981de1229ef899957bbe968bc8dcda02a21f477`.

- `npm run typecheck`: passed.
- `npm run test:unit`, twice with ordinary suite concurrency: **2119 passed, 3 skipped, 0 failed** each time. The earlier Orca cleanup `ENOTEMPTY` was not reproduced in these two bounded runs; no fix or impossibility of recurrence is claimed.
- `npm run test:integration`: **697 passed, 1 failed**. Sole failure is the existing request-cwd discovery test described below; default full validation is not green.
- `npm run test:e2e`: runtime-package gate skipped the suite; **zero tests executed**. Not E2E success evidence. The explicit real-CLI benchmark harness above did execute and pass separately.
- Upstream five focused adapter files: **63 passed**. No paid-capable full Vitest suite invoked.
- Both offline support scripts: passed. CLI run selected the checkout-local patched 0.85.1 bundle explicitly, never global Pi.
- Both checkout diff checks and portable patch reverse-application check: passed. Previously authorized upstream full check and offline build remain recorded in the adapter document; no upstream edits or rebuild in this pass. Full upstream check and parent typecheck passed again before committing; Biome applied no fixes.

Local logs: `/tmp/pi-ensemble-12-final-unit.log`, `/tmp/pi-ensemble-12-final-unit-repeat.log`, `/tmp/pi-ensemble-12-final-integration.log`.

## Existing validation debt belongs to #6

A clean `git archive` of parent HEAD, with the existing dependency directory linked, reproduced `test/integration/fork-context-execution.test.ts:1162` (`true !== undefined`). No dirty provenance files were copied. A diagnostic assertion in that temporary archive revealed:

```text
Model 'anthropic/claude-haiku-4-5' is outside the configured subagent model scope.
Allowed patterns: openai-codex/*.
```

Changing only the test invocation's `PI_CODING_AGENT_DIR` to a new empty temporary directory made the unchanged checkout test pass. This confirms ambient settings contaminate the discovery fixture; it is not a provenance regression. No user settings or project test assertions were changed.

Repro:

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs --test \
  --test-name-pattern='uses request cwd for execution-time agent discovery' \
  test/integration/fork-context-execution.test.ts

agent_dir=$(mktemp -d)
PI_CODING_AGENT_DIR="$agent_dir" node --experimental-strip-types \
  --import ./test/support/register-loader.mjs --test \
  --test-name-pattern='uses request cwd for execution-time agent discovery' \
  test/integration/fork-context-execution.test.ts
```

Logs: `/tmp/pi-ensemble-12-fork-current.log`, `/tmp/pi-ensemble-12-fork-baseline.log`, `/tmp/pi-ensemble-12-fork-diagnostic.log`, `/tmp/pi-ensemble-12-fork-isolated.log`. Existing [#6](https://github.com/elBenz/pi-ensemble/issues/6) owns hermetic validation and non-skipping real-session coverage. [Diagnosis and cleanup observation recorded there](https://github.com/elBenz/pi-ensemble/issues/6#issuecomment-5574629218), without expanding #12. [#17 launch gates reaffirmed](https://github.com/elBenz/pi-ensemble/issues/17#issuecomment-5574629398); its conditional before-screening checkbox remains unchecked in #12.

## Terminal review

Fresh independent Standards and Spec reviewers inspected both fixed-point dirty diffs and every new implementation artifact, including the portable patch and CLI harness. Old `remediation.*.md` files were excluded because they review an earlier commit.

- **Standards:** no documented breaches or blockers; one optional suggestion to type the fixed mapped-usage keys more narrowly. Deferred: fail-closed runtime behavior is covered; no refactor required for acceptance.
- **Spec:** no implementation closure blockers; one minor documentation finding separating delivered #12 scope from #17 launch prerequisites. Applied in telemetry/readiness documentation.

Reviewer outputs: `/tmp/pi-ensemble-12-final-standards.md`, `/tmp/pi-ensemble-12-final-spec.md`. Reviews were read-only; command results above were run by the parent, not independently by reviewers.
