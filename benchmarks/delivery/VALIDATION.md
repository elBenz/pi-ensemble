# Offline validation evidence

Implementation validation for issue #15; no paid model runs or routing conclusions.

## Commands

- `node --experimental-strip-types --import ./test/support/register-loader.mjs --test test/integration/benchmark-delivery.test.ts`: 11 tests passed across all nine cases. Initial test-first slices failed on missing fixtures; the watchdog slice exposed the missing installed role and drove the approved benchmark-only prompt fallback.
- `node --experimental-strip-types --import ./test/support/register-loader.mjs --test test/integration/benchmark-{delivery,support,runner,policy-runner,telemetry}.test.ts`: 44 tests passed, zero failures/skips.
- `node --experimental-strip-types --import ./test/support/register-loader.mjs --test --test-name-pattern='critical concurrency' test/integration/benchmark-delivery.test.ts`: selected concurrency test passed after allowing either independent-key start order.
- `npm run typecheck`: passed.
- `git diff --check`: passed for tracked changes; new corpus files inspected separately.
- `npm pack --dry-run --json`: packaged file list includes `docs/benchmark-prompts/watchdog.md`; no package tarball created.
- `git diff --cached --name-only`: empty. No files staged.

## Parent validation and review

- Full `npm run test:all` before the final evaluator repair: unit **2119 passed,
  3 skipped**; integration **717 passed, 1 failed**. Sole failure:
  `fork-context-execution.test.ts:1162`, request-cwd discovery polluted by ambient
  model-scope settings, already documented in `docs/benchmark-acceptance.md`.
  The unchanged failing test passed with a fresh `PI_CODING_AGENT_DIR`.
- Separate `npm run test:e2e`: runtime-package gate skipped the suite; **zero tests
  executed**, not E2E success evidence.
- Independent Standards review: no documented-standard violations. Both review
  axes identified the same evaluator false negative: requiring an undisclosed
  literal substring rejected valid source-backed concurrency findings.
- Repair verified red then green through `runBenchmarkCase`: alternate valid
  citations now pass for reviewer and watchdog; empty/fabricated quotations still
  fail. Correct line evidence, severity, unique findings and executable repair
  remain required. Removed unused literal-anchor expectations.
- Final affected suite: `benchmark-delivery.test.ts` **12 passed, zero failures**.
  Final `npm run typecheck` and `git diff --check`: passed. No unresolved review
  findings; full suites were not repeated for this corpus-only grading repair.
- All six historical source SHA-256 values independently verified against their
  pinned local Git objects.
- Logs: `/tmp/pi-ensemble-15-test-all.log`, `/tmp/pi-ensemble-15-e2e.log`,
  `/tmp/pi-ensemble-15-fork-isolated.log`, `/tmp/pi-ensemble-15-delivery-final.log`.

## Behavioral evidence

- Worker delivery: correct deadline, replay-barrier, and completion-record patches pass; claimed success/no-op, weakened zero-limit handling, unsafe fallback, malformed records, and rewritten focused tests fail.
- Reviewer: bounded-index defect detection passes; missing defects, wrong severity, invalid line evidence, broken advice, duplicate/unrelated findings, and candidate mutation fail.
- Watchdog: critical same-key queue defect and completion-guard regression detection pass; missed defects and unnecessary blocking of clean issue-drafting completion fail.
- Hidden probes: malformed/sparse/later invalid records; failed-first queue task with a third arrival after old-owner cleanup while a newer owner remains active. These are absent from candidate focused tests. Correct advice passes; plausible stale-cleanup repair fails.
- Isolation: candidate inputs exclude provenance, case JSON, hidden expectations/evaluators, solved responses, and Git metadata. Review advice is tested only after candidate exit in host-side scratch.
- Budget: synthetic $25.50 completion succeeds and retains source/result/receipt, leaves original fixture unchanged, and blocks the second queued launch. Existing plan policy is reused unchanged.
- Runner: watchdog CLI uses exact packaged frozen surrogate prompt; unknown roles still fail; hanging repair times out and cannot pass.

## Limits

Screening fixtures are reduced historical reproductions, not full source replay;
other fixtures and telemetry/pricing are synthetic. The watchdog surrogate does
not exercise production watchdog runtime/provider selection. Evaluators judge
narrow structured review and executable repair advice, not unrestricted review
prose. Host execution is not an adversarial sandbox. No live-model score, cost,
model/effort support, or routing recommendation is established. Known ambient
fork-context discovery failure and E2E runtime-package skip remain outside this
issue; full repository validation is not green.
