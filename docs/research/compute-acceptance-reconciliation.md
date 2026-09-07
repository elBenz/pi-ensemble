# Issue #12 compute acceptance reconciliation

Status: **Explicitly approved by the user on 2026-09-07 and applied to GitHub #12, with related wording updated in #9 and #17.** This decision does not authorize a campaign, change pricing, or claim unsupported capture is implemented.

## Approved decision

Use capability-based live accounting instead of requiring capture of an unverified compute-unit field. Keep actual compute capture unsupported and fail closed for compute-priced live cases until a documented field, adapter mapping and deterministic fixtures exist.

This changes two completion criteria in [#12](https://github.com/elBenz/pi-ensemble/issues/12), not its original context/spend acceptance. Approval followed an explicit explanation of unsupported compute handling, rejection of compute-priced live cases, and the separate cache-write telemetry gap. The approval itself marked no criteria complete. Subsequent [completion evidence](../benchmark-acceptance.md) records final validation and review of bounded #12 implementation; #17 remains gated.

## Existing evidence and distinction

- [Adapter/build/CLI evidence](../benchmark-adapter.md): the inspected Pi 0.85.1 Responses path has no verified compute-unit mapping. The patch snapshots raw usage before normalization; it does not manufacture a compute counter. Local real-CLI validation proves JSON/session forwarding and safe unknown-spend blocking using synthetic Responses SSE, not live Codex reporting.
- [Official Astra model page](https://developers.openai.com/api/docs/models/gpt-6-astra) and [official Responses schema](https://platform.openai.com/docs/static/api-definition.yaml): prior research records token pricing but no verified per-turn compute-unit field. Lack of a verified field is not proof that no provider, account or future API can ever charge compute units.
- [#9](https://github.com/elBenz/pi-ensemble/issues/9) records compute charges from the preserved DeepSWE artifact. Those aggregate historical charges establish importer inputs, not a current Codex per-turn response schema or subscription invoice. Preserve importer support and historical evidence unchanged.
- Benchmark cost is an API-rate estimate under root `CONTEXT.md`, not subscription fees, quota consumption or provider invoice. Token pricing alone does not prove all counters are present on the selected transport. Missing raw cache-write data remains unknown; do not add an undocumented absent-means-zero convention.

## Fresh primary-source verification (2026-09-07)

A read-only researcher fetched the two primary sources above; its retained brief is `/tmp/pi-ensemble-12-compute-reconciliation-research.md`.

- Fetched OpenAPI `info.version: 2.3.0`, `ResponseUsage`: `input_tokens`, `input_tokens_details.cached_tokens`, `output_tokens`, `output_tokens_details.reasoning_tokens`, `total_tokens`. Cached-token description: “The number of tokens that were retrieved from the cache”; reasoning-token description: “The number of reasoning tokens.” No compute-unit member was identified in this usage shape. The researcher's targeted schema search also found no `cache_write` match.
- Fetched Astra rate card: “Input $10.00”, “Cached input $1.00”, “Cache writes $12.50”, “Output $50.00” per million text tokens. Its general pricing prose says “Pricing is based on the number of tokens used, or other metrics based on the model type.” This is not a documented per-turn compute counter or conversion basis.
- Important remaining obstacle: a cache-write price does not establish the `cache_write_tokens` response field used by synthetic adapter fixtures. The current live path may still fail closed on missing cache writes even after this compute revision. Do not claim the revision makes Astra—or the full #9 matrix—priceable.
- Direct OpenAI Help Center retrieval for subscription behavior returned HTTP 403. Search summaries are excluded from the direct evidence supporting this decision. No authentication or provider inference probe was performed.

These are source-bounded findings. Do not generalize schema omissions into a universal claim about every transport or future API.

## Approved exact replacements in #12

Replace the compute-capture completion checkbox with:

> - [ ] Record the selected Pi runtime/API and supported per-turn billing telemetry with provenance. Capture raw supported usage before adapter normalization. For compute units, implement capture only when a documented provider field, verified adapter mapping and deterministic fixtures exist. Otherwise retain explicit unsupported compute telemetry and reject compute-priced live cases before launch. Never derive compute units from reasoning tokens, cumulative tokens or external aggregate charges. Unsupported compute capture is a documented capability limit, not delivered capture.

Replace the deterministic compute-charge test completion checkbox with:

> - [ ] Deterministic adapter/CLI and public runner/plan tests cover supported raw billing counters, explicit zeros, missing/partial/malformed usage, unavailable pricing, retained receipts and blocking the next queued launch. Verify compute-priced live cases reject with zero launches while compute telemetry is unsupported; require actual compute-charge fixtures before enabling that capability. Preserve external-import compute-charge tests separately. Include multi-turn fixtures proving Peak context load is neither cumulative tokens nor compute units.

All other original/completion criteria remain unchanged. In particular, preserve current-price provenance, all required usage categories, known-spend subtotals, mutation completion, $15/$25 and $30/$50 gates, 100k/150k context policy, and separate campaign authorization.

## Related tracker updates applied

- #12: apply only the two replacements above; append a dated reconciliation note linking primary evidence and recording approval. Do not tick other criteria or close the issue automatically.
- #17: replace its #12 dependency description with “Complete supported live usage accounting, explicit unsupported compute handling, and safe unknown-spend pre-launch blocking.” Preserve the dependency and every launch prerequisite.
- #9: clarify that DeepSWE compute charges remain historical external evidence, not proof of separate current Codex compute pricing. Keep its existing “complete usage or explicit unavailable cost” requirement and candidate matrix intact.

## Work identified at approval

Historical checklist; subsequent [completion assessment](../benchmark-acceptance.md) records baseline diagnosis, bounded full-suite reruns and fresh two-axis review. Local commits in both checkouts were subsequently authorized; publication and campaign authorization remain separate.

1. Fresh baseline comparison for the remaining integration failure; bounded reproduction of the intermittent unit cleanup failure; then rerun full relevant validation. No tests or checks are weakened to obtain green.
2. Fresh Standards/Spec review of all uncommitted provenance work in both repositories, using the newly approved issue text. Prior `remediation.*.md` reviews cover an older commit only.
3. Verify any further needed Codex transport/runtime behavior offline where possible. Before live validation, obtain explicit request/spend authorization; do not replace missing live counter evidence with synthetic fixtures.
4. Keep pricing unavailable for routes whose required fields cannot be established. Selecting the patched executable does not itself make such a route campaign-ready.
5. Obtain explicit commit authority, preserve unrelated artifacts, update delivery status accurately, and leave #17 separately gated. No push/publication authorization is implied.

## Pre-handoff validation (2026-09-07)

- Isolated `orca-progress-tabs.test.ts`: 14 passed, 1 Windows-only skip. The earlier concurrent full-suite `ENOTEMPTY` remains unproven fixed. Log: `/tmp/pi-ensemble-12-next-orca.log`.
- Isolated `uses request cwd for execution-time agent discovery`: still fails at `test/integration/fork-context-execution.test.ts:1162`, actual `true`, expected `undefined`. Log: `/tmp/pi-ensemble-12-next-fork.log`. No fresh baseline run performed.
- No implementation changes in this reconciliation slice. After approval, only the specified tracker wording changed. No provider-validation campaign or settings change.
