# Issue 14 implementation validation

## Scope and baseline

Implementation baseline: `846e9f77a85689ad77c161f381ffb438bbd60bb8`.
Pre-existing researcher/prompt/skill edits and `remediation.spec.md` /
`remediation.standards.md` were excluded and preserved byte-for-byte. During this
work, the pre-existing tracked edits were committed externally as `a84ccf5`;
this implementation did not commit, stage, push, or change issue state.

Delivery: nine indexed support-role cases, pinned historical source excerpt,
synthetic edge fixtures, host-only Markdown/JSON handoff and behavioral evaluators,
shared-runner integration tests, and documentation. Production runner, policy,
pricing, agent prompts, and global configuration are unchanged.

## Checks

- Final `npm run typecheck`: passed.
- Final focused integration invocation: **20 passed** across
  `benchmark-support.test.ts` (9), `benchmark-runner.test.ts` (5), and
  `benchmark-policy-runner.test.ts` (6).
- Full unit suite: **2119 passed, 3 skipped**.
- Full default integration run before review repairs: **704 passed, 2 failed**.
  All corpus tests passed. Failures:
  - `benchmark-policy-runner.test.ts:186`: observed Tail breach count 0 instead of
    1; case hit its 2-second deadline during concurrent execution. The focused
    reruns passed. This exact failure was not reproduced on the clean baseline.
  - `fork-context-execution.test.ts:1162`: ambient-settings assertion
    `true !== undefined`, freshly reproduced on clean baseline.
- Full clean-baseline integration run at `846e9f7`: **693 passed, 5 failed**.
  It reproduced the ambient assertion and four other failures in short-deadline
  benchmark tests (partial-usage, missing-context, historical replay, and telemetry
  receipt parsing). These support a concurrency/deadline concern, not a claim that
  the exact changed-tree Tail breach failure was proved pre-existing.
- Full integration run after substantive review repairs, using a new empty
  process-local `PI_CODING_AGENT_DIR` and `--test-concurrency=4`: **706 passed**.
  This was before the final small Answer-whitespace repair and its one added test;
  final focused 20-test run above covers that repair and neighboring runner policy.
- `npm run test:e2e`: runtime-package gate skipped; **zero tests executed**.
- Final `git diff --check`: passed. Historical fixture checksum matches
  `SOURCES.json`; its bytes were exported directly from the pinned Git revision.

Repeat the isolated full integration check without changing global settings:

```sh
agent_dir=$(mktemp -d)
PI_CODING_AGENT_DIR="$agent_dir" node --experimental-strip-types \
  --import ./test/support/register-loader.mjs --test --test-concurrency=4 \
  test/integration/*.test.ts
```

Default full-suite validation is **not claimed green**. Existing hermeticity,
short-deadline robustness and real-session E2E coverage remain outside this corpus
slice. Opposite-platform rename default behavior is encoded but was not executed
on Windows during this implementation.

## Two-axis review

Two independent Standards/Spec rounds completed; parent applied scoped repairs:

- **Standards:** disclosed quote bound; added platform-default regression; accepted
  wrapped Answer prose without accepting additional claims. Final whitespace fix
  reproduced red before repair, then passed the positive and negative regressions.
  No remaining actionable Standards finding after parent verification.
- **Spec:** replaced JSON-only scout/researcher output with role-compatible Markdown
  handoffs, source-bounded evidence and validated line ranges. Strengthened rename
  regression checks to verify actual writes, payload, operation ordering, rename
  paths and cleanup. Tests reject a deleted write and inverted platform default.
  Second independent Spec review reported no remaining actionable findings.

No paid benchmark, authentication probe, runtime activation, or Route migration.
Routes remain intentionally unconfigured and current pricing absent. #17 still
requires separate runtime/billing verification and explicit campaign authorization.
