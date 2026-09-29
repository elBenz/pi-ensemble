# GPT-6 screening authorization and validation — 2026-09-28

## Authorization

Parent proposed: separate $25 GPT-6 screening allowance, warning at $15, including
probes; historical balance untouched; runtime/accounting fixes before launches.
User replied **“yup”**. Approved scope: three charged medium-effort Codex probes,
then 18 screening attempts across the two matched groups and three worker tiers.
No finalists, escalation, defaults changes, publication or historical continuation.
Development/review inference is overhead, not benchmark measurement or allowance.

Only one campaign output is approved:
`/private/tmp/pi-gpt6-live.hXFZeN/campaign`.
Its ledger begins at zero under the newly approved allowance, not a reset of the
old campaign. Old measured total remains unknown; old reservation-policy charge
$18.129328 remains separate. This is a pre-launch spend gate, not a guaranteed
provider-spend ceiling; active work may finish and its full cost is retained.

## Runtime verification

Existing patched CLI unchanged:
`/Users/benz/SideProjects/pi-telemetry-adapter/packages/coding-agent/dist/bundle/cli.js`.
New isolated Codex-only configuration adds GPT-6 Sol/Luna through documented
`models.json` overlay, using current installed public Codex model metadata.
No old catalog/source modification or global settings change. Medium maps to
medium for all three models; actual isolated offline CLI lists all three.
Prospective transport is SSE across every new arm; historical speed equivalence
is not claimed. Credentials remain outside artifacts and are removed after use.

Parent reran actual bundled CLI loopback validation via
`test/support/verify-benchmark-cli.mjs`: SSE provenance survives CLI/session;
missing raw input blocks subsequent launch while retaining known spend.
This is synthetic validation, not proof of live provider counters. Live probes
must still establish availability and complete raw usage before screening.
Official model-page prices reverified 2026-09-28; gate artifact retains exact
rates, source URLs, model/effort checks, config/runtime/listing hashes.

## Review and repairs

Independent Standards/reliability review: one major correctness finding.
Independent Spec review: two major and one minor findings.

- Fully charged rejected parent actions were incorrectly treated as missing child
  usage. Fixed terminal rejected-action handling; full raw turn/cost reconciliation
  remains mandatory. Added **actual public-runner** regressions for malformed
  workflow JSON and a charged parent whose delegation hits the spend gate.
- Added fixture files escaped per-file digests. Frozen directory inventories now
  include membership and file types; extra files/empty directories block launches.
  Regression operates on private fixture copies, not original corpus.
- Unknown accounting now reports remaining allowance and affected Tail breach
  totals as null instead of implying measured completeness.

Parent inspected repairs against actual runner stop behavior. No unresolved
findings from these two review axes. Synthetic result tests alone are not taken
as proof of the actual rejected-action receipt contract.

## Executed checks

- Before repairs: campaign + preparation + existing judgment integration suites,
  **31 passed**.
- After repairs: campaign integration suite, **14 passed**, including new actual
  public-runner and fixture-inventory regressions.
- `npm run typecheck`: passed after repairs.
- `git diff --check`: passed; index unchanged/empty.

No paid inference was performed during these checks. Run receipts and live
outcomes belong to the campaign output, not this pre-launch validation record.
