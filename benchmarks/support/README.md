# Support Agent role corpus

Issue [#14](https://github.com/elBenz/pi-ensemble/issues/14). Source-checkout corpus;
`corpus.json` indexes **one screening + two additional finalist cases per role**.
These are case definitions, not a screening campaign or model recommendation.
Finalist execution uses all three cases per role, three fresh repetitions each.

| Agent role | Screening | Additional finalist cases |
| --- | --- | --- |
| scout | `scout-rename` | `scout-dispatch`, `scout-boundary` |
| delegate | `delegate-rename` | `delegate-tags`, `delegate-extract` |
| researcher | `researcher-rename` | `researcher-version`, `researcher-unknown` |

## Evidence and isolation

`fixtures/rename/src/shared/atomic-json.ts` is a byte-preserved public source
excerpt at `7be3d34396336ed4e23eb5f88cae59ddc01c97f9`; `SOURCES.json` records its
URL and SHA-256. The later change at `639162e3de08a15b3e3ca439cf38dea10c5c6865`
informs only the delegate delay-schedule subtask. Its full patch and later source
are **not** candidate inputs. This is a curated historical excerpt, not a complete
repository replay. The other six cases are synthetic edges. Synthetic research
URLs use reserved `.invalid` domains; their local documents are authoritative
only for the exercise and must not be cited as real external evidence.

The runner copies only the selected `fixtures/` subtree into each fresh candidate
workspace. Case JSON, `expectations.json`, evaluator code, behavioral checks and
test answers stay host-side. Candidate-visible source text naturally contains the
facts candidates must discover; it does not contain grading rubrics or solved
patches. Like the existing benchmark seam, this is leak prevention, **not an OS
sandbox against a malicious process**. Do not run candidates with access to secret
host material. Evaluator deadlines bound hanging candidate-module checks.

## Evaluation

Scout and researcher prompts preserve their role-required Markdown handoff/brief
sections, with a closed JSON evidence block and source-bounded summaries. Scout
citations include validated 1-based line ranges. Delegate tasks use isolated JSON
results. Public prompts state the exact structure and 500-character quote bound;
extra fields, unsupported prose, or inconsistent summaries fail. This intentionally
measures narrow role tasks rather than prose style. Exact fact values, source-scoped
URLs and verbatim relevant quotes make research checks deterministic; this is not
a general-purpose natural-language fact checker.

- **scout:** required file/symbol discovery, bounded relevance, supporting excerpts;
  runner independently enforces no mutation.
- **delegate:** exact isolated result and changed-file declaration, actual workspace
  change scope, and host-only behavioral regressions (including filesystem writes,
  payload/rename/cleanup targets, error propagation, and platform defaults). The read-only extraction
  case checks selected facts rather than executing a patch. Claimed success and
  no-op patches do not pass mutation-required cases.
- **researcher:** factual values, complete requested coverage without unsupported
  claims, primary-source scope, and supporting quotations; runner forbids mutation.

`result.json.evaluation.evidence` contains JSON with named checks and a normalized
0–1 diagnostic score. Every required check must pass; partial scores are not a
Quality floor policy. Runner execution, telemetry and mutation gates still apply
independently: evaluation success cannot turn a timed-out or mutating read-only
run into a pass. Shared result fields retain correctness, usage, Peak context load,
Benchmark cost (or its unavailable reason) and recorded historical cost. Raw receipt
`candidate.startedAt` / `endedAt` provide wall-clock latency. Receipts retain the
exact role prompt, requested/resolved Route and input case for reproducibility.

## Offline verification and later execution

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs \
  --test test/integration/benchmark-support.test.ts
```

Tests execute all nine cases using fake Pi, including one invocation through
`benchmark-runner.mjs`; they inject explicitly synthetic usage/prices and require
no network, authentication or paid model. They cover success, missing/irrelevant
findings, unsupported and incorrect claims, invalid citations, mutation violations,
no-op/regressed delivery, output leakage, and timeout. Production global settings
are not changed.

Case Routes deliberately use `unconfigured/support-corpus`; **do not execute these
as a paid campaign**. No real pricing is embedded. Before #17, generate run-specific
copies with explicitly verified model/effort/adapter support and dated complete
pricing; obtain campaign/spend authorization. When copying cases outside this tree,
resolve `fixture` and evaluator `{caseDir}` paths to the original corpus first.
Then use the existing top-level runner, not a separate executor:

```sh
# Only after runtime/pricing checks and explicit campaign authorization:
npm run benchmark -- /path/to/prepared-case-or-plan.json --output /path/to/new-results
```

Keep case prompts, fixtures and validators fixed across compared Routes. Use the
existing plan seam for balanced three-repetition screening and spend guards;
this corpus does not implement randomization or route selection. Missing raw billing
fields still make cost unavailable and block subsequent plan launches. No context
threshold, spend guard, provider integration or global Route change is introduced.
