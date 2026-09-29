# GPT-6 worker screening — 2026-09-28

**Completed: 3 probes + 18 screening attempts. API-equivalent Benchmark cost
$1.6611027; upward-rounded budget charge $1.661103 against separately approved
$25. Remaining $23.338897.** No missing usage, transport failures, or Tail breaches.
Historical interrupted campaign unchanged and separately accounted. No finalists,
retries, escalation, commits/publication, or production Route changes.

## Decision

**Sol is the strongest current worker candidate; Luna needs a tighter contract
experiment before becoming default.** This is preliminary evidence from three
repetitions of one reduced task per group, not broad model ranking.

- Standalone Sol and Astra passed all three runs. Sol cost **70.0% less**, but
  median wall time was slightly **slower**, not faster.
- Standalone Luna was very cheap and faster, but failed all three hidden regression
  checks by removing existing agent-default timeout behavior. Visible focused tests
  passed. Cheap generated code did not mean cheap accepted work.
- Luna did implement the much narrower orchestrated function correctly in all three
  runs. Two workflows completed acceptance; one lacked independent review because
  the parent mishandled a telemetry limitation. This supports testing precise
  contracts, not an unconditional Luna rollout.
- Astra parent/reviewer consumed **99.2% of the Luna workflow arm's total cost**.
  Optimizing worker token price alone cannot deliver a 100× whole-workflow saving.

## Standalone worker group

Same original task/prompt/fixtures/checks per arm; medium Thinking level throughout.
Costs include failed attempts. Time is whole runner wall time, including evaluation.

| Worker | Accepted | Mean cost/attempt | Cost/accepted result | Median seconds |
| --- | ---: | ---: | ---: | ---: |
| Astra | 3/3 | $0.06887 | $0.06887 | 26.0 |
| Sol | 3/3 | $0.02063 | $0.02063 | 29.1 |
| Luna | 0/3 | $0.00100 | unavailable | 18.4 |

Luna replaced the function with parent-deadline inheritance but removed its existing
`agent.defaultTimeoutMs` assignment. Hidden check expected `{timeoutMs: 70}` when
agent default was 70; every Luna run returned `{}`. Original source already
implemented that assignment; this was an existing-behavior regression, not a
transport error. Check evidence: each `worker-deadline--luna-worker-*` receipt/result,
original `benchmarks/delivery/fixtures/deadline/deadline.mjs`, and
`benchmarks/delivery/checks.mjs`.

## Astra-orchestrated group

Astra-medium parent and reviewer held fixed. Only worker model changes. Different
fixture/acceptance contract from standalone group: **do not compare groups to
estimate orchestration overhead**.

| Worker | Accepted workflows | Mean cost/attempt | Cost/accepted workflow | Median seconds, all attempts |
| --- | ---: | ---: | ---: | ---: |
| Astra | 1/3 | $0.14302 | $0.42905 | 35.9 |
| Sol | 3/3 | $0.18047 | $0.18047 | 88.6 |
| Luna | 2/3 | $0.13690 | $0.20535 | 92.8 |

All-Astra's low median includes two early failed workflows; **not a speed win**.
Accepted-only median seconds: Astra 94.9 (one run), Sol 88.6 (three), Luna 105.0
(two). Neither sample size supports reliable latency conclusions.

### Parent-induced confound

Astra appended this condition to three worker handoffs:

> Stop if telemetry/spend is unavailable or context exceeds 150k.

The child has no host campaign ledger interface. Two Astra workers stopped without
writing because they could not inspect spend. In the first Luna workflow, Luna
implemented successfully and reported the same visibility limitation; Astra then
integrated and verified but skipped required independent review, claiming further
launches were prohibited.

Host receipts contain complete usage throughout. **Child inability to inspect host
spend was not unknown provider usage.** These were orchestration/handoff failures,
not demonstrated Astra coding failures or missing telemetry. The bad condition was
parent-generated; fixed child prompts did not require child-side ledger inspection.
The host actually enforces spend before launches and accounts every child.

Retain all failures. Do not relabel them successful, silently repair prompts, rerun
failed samples for free, or infer that Sol is intrinsically more capable than Astra.

### Aggregate component cost

| Workflow worker | Parent | Worker | Reviewer | Total |
| --- | ---: | ---: | ---: | ---: |
| Astra | $0.213776 | $0.158198 | $0.057078 | $0.429052 |
| Sol | $0.278340 | $0.060646 | $0.202426 | $0.541412 |
| Luna | $0.272008 | $0.003378 | $0.135322 | $0.410708 |

Luna workflows cost less per attempt than Sol workflows, but more per accepted
workflow after charging failures ($0.20535 versus $0.18047). Reviewer counts differ
because failed workflows ended early; these totals are not a controlled measure of
review efficiency.

## Proposed next experiment — not executed

1. Clarify orchestration contract: **host owns usage/budget gates**; children report
   implementation evidence and do not self-certify unavailable host counters.
2. Specify preservation invariants for Luna, including existing default precedence;
   keep independent hidden checks. Version as a prompt experiment, not a silent
   alteration of the original corpus.
3. Compare the same workloads and fixed routes with/without structured handoff;
   separate prompt effects from model effects. Consider Luna-high separately.
4. Expand beyond one small task per group before default changes. Sol-first is a
   provisional practical recommendation, not an approved permanent routing decision.

Remaining allowance is not automatic authorization for new experiments or finalists.

## Evidence and reproducibility

- `summary.json`: group statistics, exact costs, artifact digests.
- `ledger.json`: all 21 observations, per-turn usage, evaluations and component costs.
- `artifacts.json.gz`: exact original manifest/cases/launch and completion markers,
  receipts/results, and public frozen source/config inputs. No credentials or Pi
  session stores archived. Gzip archive JSON keys: `files`, `publicInputs`.
- `archive.mjs`: offline archival/statistics derivation; rejects existing artifacts,
  validates manifest/case/receipt/source hashes; no inference capability.
- Campaign source: `/private/tmp/pi-gpt6-live.hXFZeN/campaign`.
- Operator/authorization/offline checks: `benchmarks/gpt6-comparison/VALIDATION.md`.

Three delegate probes cost $0.0084438 total and verified actual model/medium effort,
raw usage and priceability before screening. All new runs used the same patched
CLI and isolated Codex-only model overlay, SSE transport, disabled retries and
compaction. Global defaults/auth and historical runtime/catalog unchanged.
Temporary copied Codex credential removed after execution; public verification
inputs and receipts retained. API-equivalent token repricing is not a subscription
invoice. Development/review assistant usage is separate overhead, excluded from
these benchmark costs. No historical mixed-transport speed comparisons made.
