# Offline full-worker validation corpus

Six route-neutral tasks. Same fixture and prompt for Luna-medium, Luna-high and
Sol-medium; case routes intentionally unconfigured, medium placeholders. No live
provider/authentication, settings changes or campaign launches required for validation.
Campaign tooling and historical experiments remain separate and unchanged.

| Case | Kind | Acceptance focus |
| --- | --- | --- |
| deadline-preservation | delivery adaptation | absent/default/zero timeout precedence, deadline clamp, immutability |
| replay-boundary | delivery adaptation | mutation replay barrier, exact results, thrown/rejected errors |
| record-validation | delivery adaptation | every record validated, malformed/sparse data, order and strings |
| config-layering | multi-file feature (121 initial source lines) | new named-profile inheritance API, cycle/missing-name validation, integration/precedence, deep copies, worker-authored tests |
| queue-recovery | multi-file (112 source lines) | failure recovery, ownership, independent keys, cache commit, close/stats |
| artifact-pipeline | multi-file (101 source lines) | JSONL validation, UTF-8 manifest, staged publication, partial-write/rename cleanup |

First three adapt `benchmarks/delivery` worker source and visible/hidden semantics;
local `legacy-checks.mjs` freezes those probes without external dependencies. Last
three require inspection across two source modules. TASK.md states normative APIs,
acceptance invariants and edit boundaries; bug locations/patches are not supplied.
Visible tests provide a runnable integration entry point, not exhaustive coverage.
Workers inspect, implement and test independently without children. Prose completion
is accepted; claims do not earn credit.

`corpus.json` indexes standard `parseBenchmarkCase` configs. Candidate receives only
its fixture. Host evaluator, scope hashes, expectations and hidden probes all live
inside this tree, outside fixtures; freezing the corpus requires no sibling files.
Evaluator requires nonempty changes confined to enumerated paths, then runs
unchanged visible tests and independent hidden checks; scope is rechecked after
execution. Config additionally requires and executes a new worker.test.mjs authored
by the candidate. Other test files stay protected. Added/deleted directories,
symlinks and edits to TASK/protected tests/metadata fail scope checks. Overall pass requires
all dimensions; partial diagnostic score is not task success. Evaluation is bounded
by command timeout. Like existing benchmark evaluation, this is not a security
sandbox against malicious code deliberately attacking the host process/filesystem.

Offline validation:

```sh
node --experimental-strip-types --import ./test/support/register-loader.mjs --test test/integration/benchmark-luna-corpus.test.ts
npm run typecheck
```

Integration tests exercise public `runBenchmarkCase` with fake Pi processes: six
positive reference solutions, six unchanged no-ops, six plausible incomplete fixes
that pass visible tests but fail hidden checks, six forbidden TASK edits. References
exist only in host integration test, never candidate tree. No provider calls, tokens,
authentication or live quality claims. No 54-attempt campaign launched; route-level
quality and repeatability remain for separately approved execution after review.
