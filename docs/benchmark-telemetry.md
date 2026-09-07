# Live benchmark telemetry readiness

Issue: https://github.com/elBenz/pi-ensemble/issues/12

Bounded implementation complete locally; [final acceptance, review and validation evidence](benchmark-acceptance.md). Local commits authorized after completion; changes remain unpublished. Campaign readiness is separate; historical validation below does not supersede the final assessment.

## Delivered boundary

The public `runBenchmarkCase` / `runBenchmarkPlan` seam now requires the patched Pi terminal assistant's raw `usageProvenance` snapshot for token/context accounting. Raw candidate stdout stays in read-only `receipt.json`; normalized run schema v4 and plan schema v2 carry completeness and unavailable-cost reasons. Adapter source patch, exact contract, successful local build/real-CLI offline validation and remaining activation limits: [Responses usage provenance adapter](benchmark-adapter.md). Stock Pi 0.85.1 and other APIs without that contract fail closed; no active runtime was replaced.

- Missing, negative, non-numeric, non-finite or overflowing required token totals cannot become a zero-priced run. Explicit raw provider zeros remain valid at this boundary; adapter-inserted zeros without raw presence evidence do not.
- Missing optional reasoning remains null and is omitted from priced usage. Reasoning included in output is never charged twice.
- Missing any turn's historical cost makes the run's historical total null. It is not substituted for current repricing.
- Peak context is maximum per-turn `totalTokens`. If that field is absent, a complete finite sum of that turn's input/output/cache categories is allowed; malformed reported totals are not repaired from other fields. Incomplete peak context produces unknown eligibility, not zero. Known Tail breaches remain visible when another turn's or run's context is missing, including unfinished trailing turns. `metrics.observedTailBreach` retains positive evidence independently of the nullable exact peak; `contextPolicy.tailBreach` supplies Markdown and plan breach counts.
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

## Capability limits and #17 launch prerequisites

1. **Compute capability limited; acceptance reconciled.** `metrics.computeUnits` is null and `telemetry.computeUnits.status` is `unsupported`; there is no invented `usage.computeUnits` mapping. On 2026-09-07 the user approved explicit unsupported handling and preflight rejection instead of requiring capture of an unverified field. #12's two affected completion criteria and related #9/#17 wording were updated. Actual compute capture still requires a documented field, verified adapter mapping and tests. Existing offline importer tests exercise known external compute charges, not live telemetry. See [approved decision](research/compute-acceptance-reconciliation.md).
2. **Campaign runtime selection/live validation pending.** The approved source patch preserves raw Responses usage before zero normalization, and runner schema v4 consumes it. Authorized checkout-local hydration resolved missing generated model data; full upstream checks and the offline build passed. The actual bundled CLI passed loopback Responses SSE → JSON/session → benchmark-plan validation, selected through `PI_SUBAGENT_PI_BINARY` only inside an isolated test environment. Stock global Pi remains unpatched; no ordinary session or campaign was switched. Codex adapter SSE tests pass, but real Codex CLI/authentication and live provider field reporting remain unverified. Missing raw cache-write fields still block pricing rather than defaulting to zero. Compute acceptance is now reconciled, but this does not establish complete live token/cache reporting; see the adapter document's official-source evidence.
3. **Campaign approval.** Recheck the actual runtime, active model registry, effort resolution, fallback availability and pricing basis with fixed prompt/tool configuration. Obtain explicit run/spend authorization. Screening remains three comparable repetitions per approved candidate; finalists remain nine runs under existing context/tail and cumulative spend gates. Prompt-guidance experiments stay separate.

## Historical remediation boundary

Terminal review of `bf6911b` found that a known >150k turn followed by missing or unfinished context lost its Tail breach: the nullable exact peak was also the sole breach evidence. Remediation preserves observed breach evidence in either terminal-turn order and counts that run in plan totals without restoring eligibility. Rendering consumes the normalized decision instead of repeating the threshold policy.

Compute capture and provider omission provenance remain unmet acceptance. No runtime readiness toggle was added: current terminal JSON cannot distinguish a faithful reported zero from an adapter default, so a caller assertion or model-name gate would not verify completeness. A genuine fix needs a separately approved provider/adapter integration with supported compute and presence evidence, then deterministic charge/provenance fixtures. Explicit compute pricing still fails closed before launch. This remediation does not authorize that integration, paid screening, or global routing changes.

The later approved adapter slice supersedes the runner-only provenance boundary above; it does not satisfy compute capture by inventing fields. [Adapter validation](benchmark-adapter.md#validation) records the latest checks, successful local runtime build and remaining live-validation limits. The checks below are historical delivery/remediation results.

## Validation

Deterministic tests use fake Pi processes at the existing runner seam. Coverage includes partial multi-turn usage, invalid fields, zero usage, missing reasoning, missing/invalid context, partial historical cost, interrupted/truncated turns, malformed JSONL, uncaptured compaction usage, queued mutation blocking with retained receipts/known spend, and compute preflight with zero launches. No paid benchmark is needed for these tests.

Delivery checks:

- `npm run typecheck`: passed repeatedly, including final pre-suite check.
- Focused importer/policy units: 11 passed. Focused runner/policy/telemetry/CLI integrations: 18 passed.
- Full suites executed once at completion: unit 2119 passed, 3 skipped; integration 690 passed, 1 failed (`fork-context-execution.test.ts:1162`, `uses request cwd for execution-time agent discovery`, actual `true`, expected `undefined`). Same failure was previously reproduced on baseline `d66cb31`, as recorded in `docs/research/deepswe-refresh/implementation-notes.md`; no new baseline run was performed here.
- E2E command exited 0 but ran zero tests: real Pi-session suite skipped because runtime packages were unavailable to its test gate. This is not live E2E success evidence.
- `git diff --check`: passed. Full suite is not green.

Remediation checks (starting at `bf6911b`):

- Runner regression failed with `null !== true`; plan regression then failed with `0 !== 1`. Both passed after their respective fixes.
- Typecheck passed. Focused runner/policy/telemetry integrations: 19 passed; importer/policy units: 11 passed.
- Full suites executed once: unit 2118 passed, 2 failed, 3 skipped; integration 692 passed, 1 failed. Unit failures: `mission-store` cross-process contention child exited with `ENOTEMPTY` removing a lock directory; `orca-progress-tabs.test.ts` failed during temporary-root cleanup with `ENOTEMPTY`. Neither failure was baseline-verified in this remediation session. Integration retained the previously documented `fork-context-execution.test.ts:1162` assertion failure; no fresh baseline run.
- E2E exited 0 with zero tests: runtime-package gate skipped the suite. No paid benchmark or live provider validation ran. Full suite remains non-green.
