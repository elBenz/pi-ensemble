# Luna as an independent worker — 2026-09-28

## Bottom line

**Yes for bounded, well-specified implementation work: Luna-medium now merits a
controlled worker pilot.** All three Routes passed all 18 attempts, including
multi-file feature implementation, authored tests, preservation and debugging.
Luna-medium cost **23.3× less than Sol-medium** on this corpus. Overall median
latency was essentially tied; higher reasoning effort added time and cost without
improving observed acceptance.

This does **not** establish unrestricted repository-scale autonomy. Six bounded
workloads repeated three times are six task families, not 18 independent projects.
Task APIs/invariants/edit scope were explicit; fixtures were small and dependencies
were Node builtins. Do not project these dollar amounts directly to production.

## Results

Costs below are API-equivalent token repricing, include all worker activity within
each attempt, and exclude the separate high-effort probe and development overhead.
Every accepted result passed immutable visible tests, independent hidden behavioral
checks, nonempty implementation changes and protected-file/scope checks.

| Route | Accepted | Total cost, 18 workers | Mean cost/accepted | Median wall seconds | Mean wall seconds |
| --- | ---: | ---: | ---: | ---: | ---: |
| Luna-medium | **18/18** | **$0.028565** | **$0.001587** | 38.2 | 45.1 |
| Luna-high | **18/18** | $0.040252 | $0.002236 | 72.1 | 82.9 |
| Sol-medium | **18/18** | $0.665805 | $0.036989 | 37.4 | 49.9 |

Luna-medium costs **95.7% less** than Sol-medium here. Luna-high costs 40.9% more
than Luna-medium and consumed 83.5% more total wall time, with no measured quality
gain. This does not prove high effort never helps; it did not help these cases.

### Task-level evidence

Each table cell is accepted count / median seconds. Every Route had three fresh
sessions per case. Latin rotation balanced within-task model position across rounds.

| Task | Luna-medium | Luna-high | Sol-medium |
| --- | ---: | ---: | ---: |
| Deadline preservation | 3/3 · 33.5s | 3/3 · 43.7s | 3/3 · 29.4s |
| Replay boundary | 3/3 · 21.1s | 3/3 · 35.7s | 3/3 · 27.6s |
| Record validation | 3/3 · 30.5s | 3/3 · 46.7s | 3/3 · 28.9s |
| Config/profile feature | 3/3 · 70.0s | 3/3 · 151.8s | 3/3 · 109.9s |
| Queue recovery | 3/3 · 48.7s | 3/3 · 93.2s | 3/3 · 55.1s |
| Artifact pipeline | 3/3 · 37.6s | 3/3 · 93.1s | 3/3 · 44.1s |

The profile feature required a previously absent API, inherited settings resolution,
missing-name/cycle/shape validation, loader integration and worker-authored tests.
This was not solely a one-line bug patch. Parent spot inspection of Luna-medium's
first feature result confirmed actual chain resolution, nonaliasing behavior,
loader changes and authored inheritance/error/IO tests. Queue/pipeline deliverables
also changed both intended modules; observed summaries alone did not earn credit.

No failed attempts, transport failures, unknown usage or Tail breaches. Maximum
Peak context load: Luna-medium 7,502; Luna-high 11,468; Sol-medium 9,574. These low
loads do not test large-context resilience.

## Why this differs from initial screening

[Initial screening](../gpt6-screening-20260928/report.md) had Luna fail three
standalone deadline tasks by removing existing agent-default behavior. New task
contract explicitly names preservation of defaults, zero values, precedence and
unrelated behavior. Luna-medium and Luna-high each preserved these correctly in
all three new runs.

This is **consistent with better task structure helping Luna**, not a randomized
causal estimate: the new prompt was revised prospectively, and the comparison
runs happened later. Original failures remain in the old report and ledger.

The prior orchestrated failures came from parent-generated instructions requiring
children to inspect unavailable host telemetry. This experiment has no parent
planner/reviewer model inside candidate execution: each worker owns inspection,
implementation, tests and completion; host owns usage/accounting gates. It therefore
measures independent worker execution without that orchestration confound.

## Practical recommendation

- **Pilot Luna-medium as worker** for bounded tasks with clear acceptance criteria,
  source-preservation invariants and declared write scope.
- **Keep Astra for planning and consequential ambiguity**, outside routine worker
  loops. This campaign does not measure total Astra+Luna orchestration cost.
- **Keep Sol-medium as escalation candidate** when acceptance fails or scope becomes
  materially ambiguous. Automatic failover/recovery was not tested here.
- **Do not default to Luna-high** based on these results: slower, more expensive,
  same acceptance. Reserve it for an explicitly measured follow-up need.
- Keep independent executable acceptance and review appropriate to risk. Require
  real repository tasks before calling Luna an unrestricted full-worker replacement.

Suggested worker handoff:

```text
Goal and externally observable behavior
Relevant entry points; worker investigates implementation
Existing behavior/invariants that must remain unchanged
Allowed files and explicit non-goals
Acceptance command plus edge cases to preserve
Stop only for unresolved scope/authority; host owns spend/telemetry
Return changed files, executed checks, remaining risks
```

No production defaults, model routing, fallback chains, global settings or historical
campaign evidence were changed. Recommendation is a controlled adoption proposal,
not a completed routing rollout. Remaining allowance is not blanket permission for
unbounded further experiments.

## Accounting

- Prior GPT-6 campaign measured cost: **$1.6611027** (retained, independently repriced
  from pinned archived raw receipts).
- New Luna-high probe: **$0.0000701**, passed exact high effort/model/usage checks.
- New 54-worker cost: **$0.73462136**.
- New campaign total including probe: **$0.73469146**.
- Combined measured total: **$2.39579416**.
- Upward-rounded cumulative budget charge: **$2.395795** against original **$25**;
  remaining **$22.604205**. $15 warning never reached.

Old unrelated interrupted campaign's assumption-dependent $18.129328 charge remains
separate. No unknown usage reset, reservations for new failures, retries, replacement
samples, or additional allowance. Within an attempt workers could inspect, test and
repair their code normally; all that time and usage is included.

Same patched CLI and isolated Codex-only overlay as prior probes; same SSE, disabled
retries/compaction, original price basis. All new runs used public benchmark runner.
Temporary copied credential removed after execution; global auth untouched. These
figures are not subscription invoices. Development/corpus/review assistant usage is
separate overhead, excluded from benchmark expenditure and model-performance tables.

## Evidence, checks and limitations

- `summary.json`: costs/group metrics and archive/ledger digests.
- `ledger.json`: all 55 new observations, receipt-derived costs and acceptance.
- `artifacts.json.gz`: exact manifests, case definitions, launch/completion seals,
  raw receipts/results, delivered workspace files and frozen public inputs. JSON
  `files`/`publicInputs` values are **base64-encoded bytes**. Includes pinned prior
  provenance; never authentication files or unrelated session stores.
- `archive.mjs`: offline archival and independent raw repricing. Validates artifact,
  frozen-source and delivered-byte hashes before saving. No inference capability.
- Source output: `/private/tmp/pi-luna-full-worker.1Vv4Ph/campaign`.
- Prelaunch authorization, controls and interpretation:
  `benchmarks/luna-worker-validation/VALIDATION.md`.

Operator independent Standards/Spec review clean. Corpus initial findings fixed:
substantive feature added, scope checked after evaluation, prior committed-cache
preservation tested. Final delta review found no blockers. Parent executed 13
operator tests and 10 final corpus tests, plus typecheck; passed. Corpus tests use
public runner with fake Pi for positive/no-op/wrong-fix/scope controls; live candidate
results above are actual model runs, not those synthetic validation fixtures.

Limits: no whole production repository, vague product brief, external dependency
migration, security audit, UI judgement, long-running task recovery or long-context
case. Worker-authored test existence/execution enforced; semantic quality of those
tests is not independently scored as a comprehensive metric. Hidden acceptance is
stronger than candidate assertions but not a security sandbox or proof of complete
correctness. Three repetitions/task do not establish reliable tail latency or a
universal model-quality ordering.
