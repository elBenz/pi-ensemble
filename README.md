# pi-ensemble

Safe multi-agent delegation and scripted orchestration for [Pi](https://github.com/earendil-works/pi).

> [!IMPORTANT]
> `pi-ensemble` is an independently maintained fork of [Nico Bailon's `pi-subagents`](https://github.com/nicobailon/pi-subagents), not an unrelated rewrite or an official successor. Most of the feature surface and codebase originated upstream.

## Thank you, Nico

`pi-ensemble` would not exist without Nico Bailon's work on `pi-subagents`: its agent model, foreground and background execution, scripted workflows, missions, observability, extension APIs, and extensive test suite provide the foundation for this fork.

The repository preserves upstream Git history, copyright, and MIT license. If the original project fits your needs, use it and support it. This fork exists to explore a narrower maintenance direction—not to erase or obscure its source.

## Why this fork exists

`pi-subagents` is a broad, capable multi-agent framework. `pi-ensemble` keeps that foundation while prioritizing four constraints:

1. **Bounded parent context** — child work should not flood the orchestrator's model context.
2. **Explicit execution boundaries** — fresh context, extension loading, replay, and mutation rules should be deliberate.
3. **Parent-owned authority** — children provide work and evidence; the parent retains orchestration and final decisions.
4. **Compatibility-first hardening** — improve safety without casually breaking existing tools, commands, storage, or integrations.

## What differs from upstream

Current fork-specific work is intentionally focused rather than a wholesale redesign.

| Area | `pi-ensemble` change | Practical benefit |
| --- | --- | --- |
| Tool context | Default compact schema plus optional payload routing for rare controls | Smaller standing prompt cost; measured schema size fell from 12,127 to 1,266 bytes in the remediation benchmark (−89.6%) |
| Child results | Bounded model-facing receipts backed by verified full-output artifacts | Parent sees status and artifact location without ingesting arbitrary child prose |
| Child isolation | Fresh-context defaults and tighter ambient-extension loading for mutation-capable builtins | Less accidental inheritance of parent conversation and unrelated extension behavior |
| Replay safety | Startup/model replay stops after any observed mutation-capable tool attempt | Avoids silently repeating work after a child may already have changed state |
| Completion handling | Settled successful results survive unrelated late extension teardown failures | Valid child work is not discarded because another extension crashes afterward |
| Supervisor channel | Private file modes, bounded payloads, file validation, and untrusted-data quoting | Reduces cross-session leakage and prompt-injection risk in child-to-parent messaging |
| Parent context | Routine supervisor progress stays in TUI-only surfaces | Progress remains visible without becoming model-visible conversation history |
| Missions | Cross-process locking around mission record updates | Concurrent children preserve sibling runs, decisions, receipts, artifacts, and usage |
| Compatibility | Stable `subagent` tool, `/subagents-*` commands, storage paths, and registry identifiers retained | Existing workflows and persisted run state need fewer migration changes |

See [CHANGELOG.md](CHANGELOG.md) and commit [`76c6385`](https://github.com/elBenz/pi-ensemble/commit/76c6385) for the concrete remediation diff.

## Install

The npm package is not published yet. Install from GitHub:

```bash
pi install https://github.com/elBenz/pi-ensemble
```

For local development:

```bash
pi install /absolute/path/to/pi-ensemble
```

### Run a Route benchmark

Create a declarative JSON case, then run one isolated Agent role benchmark:

```bash
npm run benchmark -- ./benchmarks/scout-case.json --output ./benchmark-results/scout-run-1
# Installed package: pi-ensemble-benchmark ./benchmarks/scout-case.json --output ./benchmark-results/scout-run-1
```

```json
{
  "id": "scout-synthetic",
  "agentRole": "scout",
  "route": {
    "modelTier": "GPT-5.6 Luna",
    "model": "openai-codex/gpt-5.6-luna",
    "thinkingLevel": "medium"
  },
  "currentPricing": {
    "currency": "USD",
    "unit": "per-million-tokens",
    "effectiveAt": "2026-08-27",
    "source": "https://example.com/provider-pricing",
    "input": 0,
    "output": 0,
    "cacheRead": 0,
    "cacheWrite": 0
  },
  "prompt": "Find the relevant file and report its contents.",
  "fixture": "./fixtures/scout-synthetic",
  "evaluator": { "kind": "output-includes", "expected": "known result" },
  "timeoutMs": 120000,
  "mutationPolicy": "forbid"
}
```

`fixture` resolves relative to the case file. To replay history instead, replace it with `"source": { "repository": "../..", "revision": "<full commit hash>" }`; repository paths also resolve relative to the case. The runner exports only that commit's tracked tree, without Git metadata, into a unique temporary candidate directory. Candidate support files stay beside that tree; parent session/npm path variables and source-root `PATH` entries are removed. It evaluates there, records the resolved commit and file hashes, then removes the tree in `finally`, including failed runs. `fixture` and `source` are mutually exclusive.

Mutation policy accepts `forbid`, `allow`, or `require`. `currentPricing` records USD per-million-token rates and provenance. Derived Benchmark cost uses reported input, output, cache-read, and cache-write usage; reported historical provider cost remains separate. Reasoning usage is retained but not charged twice when included in output usage.

Run result schema v3 preserves missing/invalid usage as `null`, not zero. `benchmarkCostUnavailableReason` explains unavailable repricing; raw `receipt.json` keeps the original transcript. A missing historical-cost field in any turn makes the historical run total unavailable. Missing optional reasoning stays unknown and is omitted from repricing usage. Peak context uses the maximum per-turn reported total (or a sum of complete per-turn token categories if the total is absent), never cumulative output; incomplete context stays unknown and cannot establish Route eligibility. `metrics.observedTailBreach` retains any observed turn above 150k even if another turn is incomplete or unfinished. `contextPolicy.tailBreach` is true for that evidence, null for an unknown peak without a proven breach, and false for a complete peak at or below 150k; Markdown and plan breach counts consume this decision. Streaming usage updates are not counted again alongside terminal messages.

Evaluators run only after candidate exit; expectations never enter candidate prompt or workspace. Each run creates a fresh session plus read-only `receipt.json`, derived `result.json`, and `report.md`. Fixture workspaces remain as artifacts; historical candidate trees are represented by receipt snapshots and removed. Set `PI_SUBAGENT_PI_BINARY` to substitute a Pi-compatible process shim.

Run comparable repetitions and enforce cumulative spend with a plan:

```json
{
  "id": "worker-screening",
  "stage": "screening",
  "launches": [{ "case": "./worker-case.json", "repetitions": 3 }]
}
```

Pass plan JSON to the same command. Keep the complete stage in one plan: exactly three completed runs per screening Route or nine per finalist Route. Plans require `currentPricing` on every case. Screening warns at $15 and blocks new launches at $25; finalist plans warn at $30 cumulative and block new launches at $50. Checks occur between sequential launches, so active mutation-capable runs always finish. Plan results report median Peak context load per Route, mark medians above 100k ineligible, count runs above 150k as Tail breaches, and reject a nine-run finalist Route with more than one breach. Completed run receipts remain available after hard stop. Unavailable repricing also blocks subsequent launches, without interrupting the current run. Plan result schema v2 reports `budget.cumulativeSpend: null`, `complete: false`, `knownSpend` (the sum of fully repriced runs), and `unavailableReason`; it never presents that subtotal as complete campaign spend. Case pricing missing or malformed before launch is still rejected at preflight.

### Importing external DeepSWE evidence

Import a preserved official artifact through the same top-level runner without launching Pi, then regenerate a report offline:

```sh
npm run benchmark -- import-deepswe docs/research/deepswe-refresh/leaderboard-live.json \
  --output ./benchmark-results/evidence --retrieved-at 2026-09-07T11:37:08.124933+00:00
# Add --current-pricing ./openai-prices.json only when it contains dated source/rates,
# including explicit cacheWrite and computeUnit rates (zero is written as 0).
npm run benchmark -- report-deepswe ./benchmark-results/evidence/deepswe-v1.1-<sha-prefix>-unpriced \
  --output ./benchmark-results/deepswe-report
```

Import stores the source bytes read-only, content-addresses snapshots by SHA-256, and records source URL, source generation time, retrieval time, and benchmark version. Re-importing identical bytes rejects rather than overwriting; changed bytes create a new snapshot directory. Regeneration reads only that local immutable snapshot: it makes no network request, does not launch Pi, and does not change Pi settings. The normalized JSON retains every source row, all twenty GPT-6 Astra/GPT-5.6 Sol/Terra/Luna effort configurations when present, and non-GPT rows as comparison baselines only. Markdown compares GPT configurations; baseline evidence remains in JSON.

`--current-pricing` JSON is keyed by source model and uses USD per million units. Every rate is explicit so missing data cannot become a zero charge. Example below reproduces the snapshot's Astra cost basis; replace its example URL/date and verify rates before treating them as current pricing:

```json
{
  "gpt-6-astra": {
    "currency": "USD",
    "unit": "per-million-tokens",
    "effectiveAt": "2026-09-07",
    "source": "https://example.com/pricing",
    "input": 12,
    "output": 50,
    "cacheRead": 1.2,
    "cacheWrite": 15,
    "computeUnit": 2
  }
}
```

`input`, `output`, `cacheRead`, and `cacheWrite` are USD per million tokens; `computeUnit` is USD per million compute units. Import requires a valid ISO effective date, HTTP(S) source URL, USD currency, finite non-negative rates, and all required usage fields. The pricing file is retained with a SHA-256 in provenance; regeneration verifies it before producing a report.

Recorded historical cost, captured website-adjusted cost, and independently current Benchmark cost are distinct. Without complete dated current pricing and usage provenance, current Benchmark cost remains explicitly unavailable; this avoids token-only Astra undercounting because Astra has compute-unit charges. The local live runner intentionally rejects `computeUnit` pricing before launching Pi because it does not yet capture compute-unit telemetry; external DeepSWE import supports compute charges. Context absent from aggregate evidence is `unknown`, not eligible or failed. Live results explicitly report `metrics.computeUnits: null` and unsupported compute telemetry. Pi's adapter-normalized zeros cannot prove that original provider fields were present. See [live telemetry readiness](docs/benchmark-telemetry.md) for inspected runtime versions, model/effort support, and remaining screening blockers.

For host-side validation, use `evaluator.kind: "command"` with `command`, optional `args`, `expectations`, and `timeoutMs`. `{input}`, `{workspace}`, and `{caseDir}` tokens resolve after candidate exit; the same input and workspace paths are exposed as `PI_BENCHMARK_EVALUATOR_INPUT` and `PI_BENCHMARK_WORKSPACE`. Evaluator input JSON contains `candidateOutput`, `workspace`, and `expectations`. Commands are trusted case configuration and run with operator permissions.

A complete historical case lives at `benchmarks/historical-mission-lock/case.json`. It replays the source immediately before the later fix; its host-only evaluator preserves known lock-collision behavior and adds an unseen Windows edge case.

### Replacing `pi-subagents`

Do not load both packages simultaneously: both register the same `subagent` tools and `/subagents-*` commands.

```bash
pi remove npm:pi-subagents
pi install https://github.com/elBenz/pi-ensemble
```

If you installed `pi-subagents` from Git or a local path, remove that exact source shown by `pi list`, then install `pi-ensemble`. Restart Pi after switching packages.

## Try it

Ask Pi naturally:

```text
Use reviewer to review this diff.
```

```text
Ask oracle to challenge this plan before we edit.
```

```text
Run parallel reviewers for correctness, tests, and unnecessary complexity.
```

Pi decides how to call the stable `subagent` tool and compose the work.

## How it works

Pi remains the parent orchestrator. Each subagent is a focused child session with its own task, model, tools, context, and optional isolated worktree.

- Fresh or explicitly forked child context
- Foreground and asynchronous execution
- Scripted sequential, parallel, branching, retry, and resume workflows
- Bounded model-facing receipts backed by full output artifacts
- Capability ceilings, replay barriers, mission locking, and supervisor messaging
- Fleet status, live inspection, steering, stopping, and durable run records

Installing the extension does not start autonomous work. It adds capabilities the parent session may invoke.

## Builtin agents

| Agent | Purpose |
| --- | --- |
| `scout` | Fast codebase reconnaissance |
| `researcher` | Web and documentation research |
| `worker` | Scoped implementation and validation |
| `reviewer` | Correctness, test, and simplicity review |
| `oracle` | Read-only second opinion and assumption challenge |
| `delegate` | Lightweight general delegation |

Recommended implementation loop: `clarify → scout → worker → fresh reviewers → worker`.

## Compatibility and migration notes

- Model-facing tool name remains `subagent`.
- Existing workflow payloads and `/subagents-*` commands remain compatible.
- Internal `pi-subagents.*` registry keys and established storage paths remain where changing them would break interoperability or existing state.
- TypeScript package imports use the new package name, for example `pi-ensemble/background-work`.
- The bundled parent skill still uses compatibility-oriented subagent terminology internally. Further renaming will require explicit migration support.
- Upstream changes are not merged automatically; every sync must be reviewed against fork-specific boundaries.

## Caveats and security boundaries

- **Not a sandbox.** Pi extensions execute with the user's OS permissions. A child can use every tool and extension its resolved launch contract allows.
- **Capability controls are policy boundaries, not process isolation.** Use containers, restricted credentials, or separate OS accounts when stronger isolation is required.
- **Artifacts may be sensitive.** Child transcripts, prompts, results, and receipts can contain source code or secrets. Protect session and artifact directories accordingly.
- **Remote actions remain human authority.** A passing child, reviewer, CI receipt, or mission record is evidence—not permission to merge, publish, deploy, or release.
- **Composite async workflows may be intentionally unbounded.** Configure child/runtime limits when finite completion time matters.
- **Real-session E2E depends on Pi runtime fixtures.** That suite skips when required runtime packages are unavailable; unit, integration, and type checks remain the baseline.
- **Young fork.** Version `0.1.x` signals that naming, release automation, and upstream-sync policy are still being established.

## Known roadmap gaps

These areas are not claimed as solved:

- true nonterminal review gates
- finite top-level timeout semantics for composite async workflows
- capability-token authentication for supervisor messaging
- clearer model-scope naming and enforcement
- deeper turn, tool, and usage-budget semantics
- typed prompt-section filtering and stronger memory-integrity guarantees

Contributions and design discussion are welcome, but compatibility and execution safety take precedence over feature count.

## Documentation

- [Agents](docs/agents.md)
- [Models](docs/models.md)
- [Workflows](docs/workflows.md)
- [Watchdog](docs/watchdog.md)
- [Tool reference](docs/tool-reference.md)
- [Observability](docs/observability.md)
- [Missions and schedules](docs/missions.md)
- [Configuration](docs/configuration.md)
- [Extension API](docs/extension-api.md)

Use `/subagents-doctor` to inspect installation health and `/subagents-guide [topic]` for installed-version help.

## License

[MIT](LICENSE). Original and fork copyright notices are preserved.
