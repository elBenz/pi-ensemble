# Live benchmark telemetry readiness

Issue: https://github.com/elBenz/pi-ensemble/issues/12

## Delivered boundary

The public `runBenchmarkCase` / `runBenchmarkPlan` seam consumes Pi terminal assistant usage, not raw provider responses. Raw candidate stdout stays in read-only `receipt.json`; normalized run schema v3 and plan schema v2 carry completeness and unavailable-cost reasons.

- Missing, negative, non-numeric, non-finite or overflowing required token totals cannot become a zero-priced run. Explicit reported zeros remain valid at this boundary.
- Missing optional reasoning remains null and is omitted from priced usage. Reasoning included in output is never charged twice.
- Missing any turn's historical cost makes the run's historical total null. It is not substituted for current repricing.
- Peak context is maximum per-turn `totalTokens`. If that field is absent, a complete finite sum of that turn's input/output/cache categories is allowed; malformed reported totals are not repaired from other fields. Incomplete peak context produces unknown eligibility, not zero. Known Tail breaches remain visible when another run's context is missing.
- Error/aborted responses, unfinished turns, malformed JSONL, and compaction events make current repricing unavailable. Summary-model usage outside terminal assistant telemetry must not be silently ignored.
- A plan retains the completed run, evaluation, mutations and receipts, then blocks queued launches on unavailable cost. Known spend is a labeled subtotal of fully repriced runs; complete cumulative spend is null. Unknown cost on the final launch still fails the plan, even with no queued work to block.
- Existing inclusive screening $15 warning/$25 stop, finalist $30/$50 limits, 100k typical target and 150k Tail breach threshold are unchanged. No spend-only interruption is added.

Preflight still rejects missing/malformed plan pricing and explicit live `computeUnit` pricing. Unsupported compute-priced cases launch no candidate and create no run receipt because no run occurred. Offline DeepSWE import remains the supported compute-charge path.

## Installed-runtime evidence (2026-09-07)

Runtime inspection was offline: no benchmark candidates, authentication probes, model-catalog updates or settings mutations. Development reconnaissance subagents did run; those inference calls are not benchmark executions.

Actual executable resolution in a standalone Node invocation of `getPiSpawnCommand([])` returned `pi`; PATH resolved it to the global Node installation's Pi 0.85.1. Spawn precedence in `src/runs/shared/pi-spawn.ts` permits `PI_SUBAGENT_PI_BINARY`, standalone Pi, or a resolved CLI script to select a different runtime. Reverify that runtime before a campaign.

Global package root: `$HOME/.nvm/versions/node/v24.13.1/lib/node_modules/@earendil-works/pi-coding-agent`.

Evidence under that root:

- `README.md`, `docs/models.md`, `docs/json.md`: CLI/JSON mode, thinking-level maps, terminal `message_end` authority and delta-only streaming usage.
- `dist/bundle/chunks/chunk-JVUZSMYM.js`: bundled `openai-codex` catalog includes `gpt-6-astra`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, all on `openai-codex-responses` with 272000 context windows. Astra explicitly maps low, medium, high, xhigh and max; Sol/Terra/Luna have default low/medium/high mapping and explicit xhigh/max mapping. Astra off is unsupported; minimal maps to low. These are catalog capabilities, not successful request evidence or independently verified current pricing.
- `dist/bundle/chunks/openai-codex-responses-R6VYZTVY.js`: Codex transport initializes standard token/cost usage and invokes the shared Responses parser.
- `dist/bundle/chunks/chunk-OUXLLA64.js`: shared terminal response parser maps `input_tokens`, `output_tokens`, cached/cache-write details, reasoning details and `total_tokens`. It uses `|| 0` for missing provider fields and does not preserve compute units. No verified compute-unit field is available to this runner.

The repo's resolved `@earendil-works/pi-ai` is **0.81.0**, not the global bundle. Its types (`dist/types.d.ts`, `Usage`) and Codex adapter have no compute-unit schema, and its bundled catalog lacks Astra. Inspecting that dependency alone would incorrectly label the installed CLI's Astra ID unavailable.

## Provisional routing resolution

Global settings supply the role overrides; repository `.pi/settings.json` is absent. Parent is Astra-medium; subagent-wide default remains Sol-medium. `models.json` is absent from the user agent directory. No auth data or unrelated settings are included here.

Offline `buildModelCandidates` resolution against IDs extracted from the installed Codex catalog retained these exact configured chains:

| Agent role | Primary | Configured fallback |
| --- | --- | --- |
| Scout | Luna-low | No explicit global override |
| Delegate | Astra-low | Luna-medium |
| Researcher | Terra-medium | Luna-medium |
| Worker | Astra-low | Luna-high |
| Reviewer | Astra-medium | Terra-high |
| Oracle | Astra-medium | Terra-high |

All entries are qualified `openai-codex` IDs. The resolver preserves thinking suffixes and does not switch providers for a qualified query. Available-registry/auth filtering and real failure-triggered fallback launches are not established by this static catalog check. Same-provider quota/auth failures can defeat the entire chain. Watchdog selection remains a separate runtime-selection prerequisite, not a proved Sol-high route.

## Remaining blockers: do not close #12 or launch #17

1. **Compute capture unsupported.** `metrics.computeUnits` is null and `telemetry.computeUnits.status` is `unsupported`; there is no invented `usage.computeUnits` mapping. Actual per-turn compute-charge tests through live Pi cannot be written honestly until a supported adapter field/source exists. The existing offline importer tests exercise known external compute charges, not live telemetry.
2. **Upstream omission erasure.** This implementation distinguishes missing fields in Pi JSON, but cannot reconstruct provider omissions already normalized to zero by Pi. A faithful provider-usage/provenance signal or approved transport integration is required before claiming provider-level completeness. Do not infer full Astra pricing from token-only metadata or reasoning tokens.
3. **Campaign approval.** Recheck the actual runtime, active model registry, effort resolution, fallback availability and pricing basis with fixed prompt/tool configuration. Obtain explicit run/spend authorization. Screening remains three comparable repetitions per approved candidate; finalists remain nine runs under existing context/tail and cumulative spend gates. Prompt-guidance experiments stay separate.

## Validation

Deterministic tests use fake Pi processes at the existing runner seam. Coverage includes partial multi-turn usage, invalid fields, zero usage, missing reasoning, missing/invalid context, partial historical cost, interrupted/truncated turns, malformed JSONL, uncaptured compaction usage, queued mutation blocking with retained receipts/known spend, and compute preflight with zero launches. No paid benchmark is needed for these tests.

Delivery checks:

- `npm run typecheck`: passed repeatedly, including final pre-suite check.
- Focused importer/policy units: 11 passed. Focused runner/policy/telemetry/CLI integrations: 18 passed.
- Full suites executed once at completion: unit 2119 passed, 3 skipped; integration 690 passed, 1 failed (`fork-context-execution.test.ts:1162`, `uses request cwd for execution-time agent discovery`, actual `true`, expected `undefined`). Same failure was previously reproduced on baseline `d66cb31`, as recorded in `docs/research/deepswe-refresh/implementation-notes.md`; no new baseline run was performed here.
- E2E command exited 0 but ran zero tests: real Pi-session suite skipped because runtime packages were unavailable to its test gate. This is not live E2E success evidence.
- `git diff --check`: passed. Full suite is not green.
