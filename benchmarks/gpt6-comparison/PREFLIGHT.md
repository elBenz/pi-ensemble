# GPT-6 comparison preflight — 2026-09-28

Offline inspection only. No model inference, authentication access, catalog
refresh, settings/default changes or external runtime edits performed.

## Runtime mismatch

Inspected patched runtime:
`/Users/benz/SideProjects/pi-telemetry-adapter`.

Its source Codex catalog SHA-256 remains
`a10bfcfd34db6bcb98d8ee46175e154cab30530a137dbf31ac1434020ed3ffdd`.
Among the three proposed GPT-6 models, this catalog contains only `gpt-6-astra`.
Astra maps medium Thinking level to medium and advertises a 272000-token context.
The built JavaScript bundle contains `usageProvenance` and `gpt-6-astra` strings,
but neither `gpt-6-sol` nor `gpt-6-luna`.

The current global Pi bundle under
`/Users/benz/.nvm/versions/node/v24.13.1/lib/node_modules/@earendil-works/pi-coding-agent`
contains all three GPT-6 model strings, but no `usageProvenance` string.

These are static catalog/bundle observations, not authenticated availability,
successful requests, or proof of complete raw usage. Neither inspected runtime
is yet established as suitable for this comparison. Do not choose an unpatched
runtime merely because its model catalog is newer. Prepare an isolated updated
runtime/catalog with verified provenance before probes; preserve the historical
runtime/catalog needed for the original campaign's continuation gates.

## Accounting decision required

Historical interrupted campaign remains separate and unchanged:

- Known spend (upward rounded): $1.729328.
- One specifically scoped assumption-dependent reservation: $16.40.
- Reservation-policy charge: $18.129328.
- Remaining against its original $25 allowance: $6.870672.
- Measured total: unknown; reservation is not recovered usage or a proven ceiling.

Sources: `docs/research/screening-20260909/accounting-reservation.md` and
`continuation-validation.md`. That continuation permits only fourteen original
unlaunched attempts, not this GPT-6 experiment. Do not repurpose its allowance or
reset historical unknown spend by generating another directory.

User said “ok go” after preparation. Proceed with preflight; obtain an explicit
budget/allocation decision before inference because no new numerical allowance
or relationship to historical accounting was specified. Suggested scope for
approval: a separate GPT-6 screening allowance, with old charge and unknown
measured total still visible; no old-campaign continuation or finalists.

## Remaining engineering gates

- Isolated runtime supporting new model IDs and raw usage provenance.
- Live, separately budgeted probes after authorization; missing usage stops.
- Workflow-arm-aware grouping with one cumulative ledger for all new probes,
  screening parents and children. Stock plan grouping merges child-route variants.
- Explicit handling of prior accounting alongside any newly approved allowance.
- Current pricing verification and source/case immutability checks.

Drafts remain intentionally unlaunchable. Escalation and repository-scale
coverage remain deferred as documented in README.md.
