# Delivery and review Agent role corpus

Issue [#15](https://github.com/elBenz/pi-ensemble/issues/15), seeded from the workload
boundaries in [#9](https://github.com/elBenz/pi-ensemble/issues/9). `corpus.json`
indexes one screening case plus two additional finalist-ready cases per Agent role.
Finalist validation uses all three cases, three fresh repetitions each. This is
an offline corpus, not a paid campaign or Route recommendation.

| Agent role | Screening | Additional finalist cases |
| --- | --- | --- |
| worker | `worker-deadline` | `worker-boundary`, `worker-records` |
| reviewer | `reviewer-index` | `reviewer-queue`, `reviewer-records` |
| watchdog | `watchdog-guard` | `watchdog-queue`, `watchdog-clean` |

## Provenance and task scope

`SOURCES.json` records pinned public before/fix revisions, original source URLs
and SHA-256 values, explicit adaptations, and hashes of every candidate fixture.
The three screening cases are **history-derived reduced reproductions**, not
byte-preserved source excerpts or complete repository replays:

- Deadline inheritance reduces the launch-default seam fixed by
  `cc5f0bdabe61ef7966fa454290f94cd1376aee49`, preserving explicit child limits and
  agent defaults while inheriting remaining workflow time.
- Async listing reduces the unbounded-history-query seam fixed by
  `50da8cf54b1ebdb37cdedb90e64e9d90e318c1f1` to an injected storage interface.
  Exact lookup, bounded recent lookup, session isolation, and no fallback scan
  remain observable; the full filesystem index implementation is not replayed.
- Completion judgment reduces the issue-drafting false positive fixed by
  `840b51472d5eb858b9d706301bd1e6dc709e87dc` to validated intent fields. It does
  **not** measure the production natural-language intent classifier.

Other cases are synthetic. The execution replay-barrier case is informed by
public fix `76c638548371624dfa72e976bf6603af7351e763`, but neither its code nor
its full regression suite is reproduced. Queue ownership schedules, malformed
completion records, and the clean advisory-completion control are invented.
No private sessions, unrelated repositories, or live pricing are included.

## Evaluation contract

All cases use the existing top-level runner, fresh sessions, isolated fixture
copies, immutable receipts, and normalized usage/cost/context reporting.
Only the selected fixture subtree enters the workspace. Prompts state the
behavioral contract and exact JSON response shape. Case definitions, source
provenance, expectations, solved test responses, and evaluator code remain
host-side. This prevents accidental leakage, **not malicious host inspection**;
this runner is not an OS sandbox. Source and prompts necessarily reveal the
requirements against which the candidate must reason.

- **Worker:** source must actually change, only the declared target may change,
  supplied focused tests must pass, and host-only regressions must pass. Tests
  and completion evidence cannot be rewritten to manufacture success. Checks
  cover deadline precedence/zero/exhaustion, replay after mutation attempts,
  error/result propagation, and malformed completion records including sparse
  arrays and invalid later members. The host reruns focused tests independently;
  a candidate's claim to have run them is not trusted or used as evidence.
- **Reviewer:** measures seeded-defect recall, correct severity, verbatim bounded
  line evidence, actionable repair, and false positives. Each defective case
  contains one material seeded defect. Findings include a **narrow, unapplied
  replacement suggestion**. After candidate exit, the evaluator applies that
  suggestion in separate host-side scratch and runs focused plus hidden checks.
  Correct advice need not match an expected patch. Nonempty explanation prose
  supplies a handoff, but is not treated as a general semantic truth checker;
  source evidence and executable advice establish correctness.
- **Watchdog:** additionally judges whether implementation and supplied completion
  report may be accepted. Detects completion-guard regression and unsafe queue
  ownership, while the clean issue-drafting report must be allowed without
  demanding unnecessary edits. Defect advice undergoes the same hidden checks.
  Concurrency probes include rejection recovery and a third same-key task
  arriving after the old owner's cleanup while a newer owner remains active.
  This catches superficially plausible fixes that pass ordinary focused tests.

Diagnostic evidence is JSON with named checks and a normalized 0–1 score. All
required dimensions must pass; partial diagnostic scores are not a Quality floor
policy. Extra/duplicate findings lower the score and fail the case. Independent
runner execution, mutation, and telemetry gates still apply even if advice is
correct. Evaluator deadlines bound hanging candidate code or suggestions;
scratch is removed normally and lives under the run output for cleanup if the
evaluator is terminated.

### Watchdog prompt seam

Production watchdog is not an installed `agents/watchdog.md` Agent role. The
benchmark runner uses the frozen read-only surrogate at
`docs/benchmark-prompts/watchdog.md` **only** for `agentRole: watchdog`. The prompt
is packaged by the existing `docs/**/*` rule and copied to `agent-role.md` in
run artifacts, with its path and case prompt recorded in the receipt. Unknown
roles still fail. No production agent, provider selection, routing, or watchdog
policy is installed or changed. These cases benchmark watchdog responsibilities,
not production watchdog runtime integration.

## Offline verification and later execution

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  --test test/integration/benchmark-delivery.test.ts
npm run typecheck
```

The fake-Pi integration suite executes all nine cases, including watchdog via
`benchmark-runner.mjs`. It exercises good delivery, no-op/regressed delivery,
critical-defect detection, misses, severity/evidence errors, false positives,
malformed records, concurrency schedules, unnecessary blocking, unauthorized
mutation, hanging advice, and post-budget safe completion. Synthetic raw usage
and prices are test-only; no provider calls or authentication are needed.

Budget exhaustion uses existing plan policy: allow the already-running
mutation-capable case to finish, retain workspace/results/receipts, then refuse
the next launch. A corpus-specific test crosses the $25 screening threshold,
verifies completed behaviorally correct delivery and unchanged original fixture,
and observes exactly one launch. No mid-run spend interruption, new hard tool
budget, or production policy change is introduced. Ordinary execution and
evaluator safety timeouts remain in force.

Corpus Routes intentionally use `unconfigured/delivery-corpus`; do not run a
paid campaign with these definitions. Before #17, obtain explicit run/spend
authorization and verify supported model IDs, Thinking levels, adapter telemetry,
and dated complete pricing. Prepare run-specific case/plan copies; resolve
`fixture` and evaluator `{caseDir}` paths back to this corpus before relocating.
Use the existing runner/plan seam, not a separate executor:

```sh
# Only after runtime/pricing verification and explicit campaign authorization:
npm run benchmark -- /path/to/prepared-case-or-plan.json --output /path/to/new-results
```

Keep fixtures, prompts, and evaluators fixed across compared Routes. Source-checkout
corpus follows `benchmarks/support`; it is not bundled by the package file list.
Missing billing/context data retains existing unavailable/fail-closed policy.
No global settings, current provisional Route, or spend/context threshold changes.
