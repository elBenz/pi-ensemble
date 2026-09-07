# Offline importer implementation handoff

Issue: https://github.com/elBenz/pi-ensemble/issues/13

## Delivered

- `src/benchmark/deepswe.ts`: immutable source snapshots, checksum/provenance checks, twenty-configuration coverage, raw metric retention, separate recorded/site/current costs, compute-unit accounting, context eligibility, effort deltas and labeled Pareto reporting.
- Top-level commands: `import-deepswe` and `report-deepswe`; README contains usage and pricing schema.
- Captured 70-row official artifact preserved here. Non-GPT rows remain comparison baselines. All twenty published GPT configurations are present.
- Astra repricing at source rates reproduces the high-effort recorded mean cost ($5.723721956194691) without double-charging cache writes.
- Current repricing requires complete explicit usage and pricing. GPT-5.6 rows in this snapshot lack required usage categories, so current costs remain unavailable; captured website-adjusted costs remain separately usable for provisional comparisons.
- Astra peak context remains unknown. Neither missing current prices nor missing context can be treated as zero, eligibility, or evidence of dominance.

## Validation

- `npm run typecheck`: passed.
- Focused unit checks (`deepswe.test.ts`, `benchmark-policy.test.ts`): 11 passed.
- Focused integrations (`deepswe-cli.test.ts`, `benchmark-runner.test.ts`, `benchmark-policy-runner.test.ts`): 9 passed.
- CLI integration blocks child-process launch and network connections/fetch through a preload guard; import/report complete with no attempted forbidden operations and no files created under isolated HOME.
- Full unit suite before final focused refinements: 2116 passed, 3 skipped, one file-level cleanup failure in `orca-progress-tabs.test.ts` (ENOTEMPTY). Same cleanup failure reproduced in exported baseline HEAD `d66cb31`; isolated changed-tree rerun passed (14 passed, 1 skipped).
- Full integration suite: 681 passed, one failure in `fork-context-execution.test.ts` (`uses request cwd for execution-time agent discovery`). Same assertion reproduced in exported baseline HEAD `d66cb31`.
- `git diff --check`: passed. No paid benchmark or global settings mutation.

## Before live screening

- Verify actual Pi model/effort support and complete per-turn telemetry.
- Live runner currently rejects explicit compute-unit pricing before launch because compute telemetry is unsupported. External importer supports those charges; do not infer live Astra cost support from importer support.
- Review also identified an existing local transcript-parser limitation: missing input/output/cache fields default to zero. This logic predates issue 13. Harden completeness tracking and retained-receipt/spend-stop behavior before trusting new-provider live screening; this offline delivery does not claim to fix it.
- Preserve fixed prompts for model comparisons. Prompt-guidance experiments remain separate.

Validation above was recorded before commit. No issue closure or routing recommendation was applied during implementation.
