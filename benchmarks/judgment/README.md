# Decision and orchestration Agent role corpus

Issue [#16](https://github.com/elBenz/pi-ensemble/issues/16), following the workload
contracts in [#9](https://github.com/elBenz/pi-ensemble/issues/9). All six fixtures
are synthetic, repository-local public examples; no private sessions, historical
replay claims, live prices, or approved Route recommendations are included.

| Agent role | Screening | Additional finalist cases |
| --- | --- | --- |
| oracle | `oracle-lineage` | `oracle-stale`, `oracle-evidence` |
| parent | `parent-deadline` | `parent-queue`, `parent-attempts` |

`corpus.json` indexes the cases. Screening uses three fresh repetitions of the
screening case; finalist validation uses all three cases, three repetitions each.

## Hidden evaluation

Only fixture files enter candidate workspaces. Rubrics, evaluator code and test
answers stay host-side. This prevents accidental answer leakage, not deliberate
host inspection; the runner is not an OS security sandbox.

Corpus command evaluators opt into `requireStructuredVerdict`: stdout must be a
JSON object with boolean `passed`, and success requires `passed: true` plus exit
zero without timeout. Early exit without a completed verdict fails, including
candidate `process.exit(0)` during hidden checks. Other command evaluators retain
exit-code-only behavior unless they opt in.

Oracle returns structured decisions with verbatim source evidence. The host-only
rubric checks authority, context lineage, both alternatives' benefits and risks,
drift avoidance, and recommendation quality/uncertainty. Unsupported certainty,
wrong decisions, invented citations, omitted alternatives and extra claims fail.
The constrained choice vocabulary makes deterministic scoring possible; it is
not a general semantic grader of unrestricted advisory prose.

Parent must actually delegate implementation, integrate the child artifact,
obtain independent review of the integrated bytes, and request executable
acceptance. A scout is available but unnecessary for these identified seams.
The hidden rubric checks observed role order, scope and file hashes, absence of
ignored negative reviewer findings, protected task/test files, actual integrated
code, and host-only edge-case behavior. Final success prose cannot substitute
for child launches or acceptance. Extra delegation lowers the score. All required
checks must pass; partial 0–1 scores are diagnostics, not a Quality floor policy.

These deliberately narrow workflows require clean child execution and review;
a failed child or unresolved reviewer finding rejects the run, even if a later
parent claims recovery. They do not yet measure sophisticated recovery quality.

## Actual multi-agent execution, not fictional child services

`workflow` is a benchmark-only runner protocol, not a production extension API.
The parent uses normal Pi tools for inspection/integration, then ends its current
print invocation with exactly one JSON action:

- `{"action":"delegate","role":"worker","task":"bounded task and context"}`
- `{"action":"verify"}`
- `{"action":"finish","certainty":"verified","accepted":true}`

The runner launches an actual fresh Pi child process using the selected allowed
role's frozen prompt and explicitly configured Route. Children share the exported
workspace but have separate sessions. The child receives the fixed role contract
plus only the parent's explicit task/handoff, not inherited parent history.
Children may not redelegate. The parent receives observed exit status, mutations
and output, resumes the **same** initially fresh session, and owns integration.
Verification is a trusted case-configured local command, run by the runner.
Subsequent changes invalidate its snapshot. Hidden validation runs independently
after candidate execution. No Pi extension APIs or production discovery change;
parent uses `docs/benchmark-prompts/parent.md` as a frozen benchmark-only prompt.

Delegation is sequential; `maxDelegations` (1–8), `maxParentTurns` (2–16) and one
whole-workflow deadline bound execution. Identical successful repeat delegations
are refused. The corpus additionally rejects unnecessary roles or extra launches.
Raw receipts retain each parent/child invocation, session, output, resolved Route,
per-turn context/token evidence, child changes and verification results.

Workflow result schema v5 sums parent **and child** usage. Benchmark cost has
`{amount, components}`: each component preserves its own dated pricing and usage,
in model-launch order. Ordinary single-process results retain schema v4. Peak
context is the maximum per-turn load, never the sum across sessions. Parent and
child per-session evidence remains available to distinguish their contributions.

A parent turn crossing 150k may finish safely, but cannot request another model
turn in that session. A terminal child breach is retained as a Tail breach, not
misclassified as parent continuation: children are never resumed. Within-process
unsafe continuation is penalized from per-turn evidence. Active model processes
are not interrupted for token/spend gates; ordinary timeouts still apply. Starting
a fresh benchmark run is required after a parent boundary stop; no hidden
compaction or automatic handoff erases evidence. Typical and finalist tail gates
remain unchanged in the plan policy.

Before **every** parent or child launch, the runner checks remaining campaign
budget (standalone workflow default: $25). Unknown usage/pricing, Route mismatch,
or exhausted spend blocks further launches, preserving completed evidence. An
already-running mutation-capable child may finish; its over-budget cost remains
recorded. Fixed child Routes/prices must remain unchanged across parent Route
comparisons. Unknown compute-unit telemetry stays unsupported/fail-closed.

## Offline validation and later campaign preparation

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  --test test/integration/benchmark-judgment.test.ts
npm run typecheck
```

Fake Pi processes replace **both parent and real child process boundaries** in
these tests; acceptance commands and hidden behavioral validators actually run.
Tests exercise correct/incorrect decisions, fabricated orchestration, child
failures, needless delegation, stale review, ignored findings, context lineage,
fixed-route mismatch, per-child prices and remaining campaign spend. No provider
authentication or paid access is needed.

Corpus Routes intentionally use `unconfigured/judgment-corpus`. After separate
run/spend approval and adapter/model/Thinking-level verification, prepare case
copies with the parent and **every allowed child** Route and complete current
pricing. Missing pricing rejects before launch. Resolve fixture/evaluator paths
back to the corpus when relocating case files. Run via the existing command:

```sh
# Only after explicit authorization and complete runtime/pricing verification:
npm run benchmark -- /path/to/prepared-plan.json --output /path/to/new-results
```

No settings changes, paid campaign, publication, or production orchestration
integration is authorized by this corpus. Like support/delivery, the corpus is
source-checkout material, not bundled package fixtures.
