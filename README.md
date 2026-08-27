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
  "prompt": "Find the relevant file and report its contents.",
  "fixture": "./fixtures/scout-synthetic",
  "evaluator": { "kind": "output-includes", "expected": "known result" },
  "timeoutMs": 120000,
  "mutationPolicy": "forbid"
}
```

`fixture` resolves relative to the case file. To replay history instead, replace it with `"source": { "repository": "../..", "revision": "<full commit hash>" }`; repository paths also resolve relative to the case. The runner exports only that commit's tracked tree, without Git metadata, into a unique temporary candidate directory. Candidate support files stay beside that tree; parent session/npm path variables and source-root `PATH` entries are removed. It evaluates there, records the resolved commit and file hashes, then removes the tree in `finally`, including failed runs. `fixture` and `source` are mutually exclusive.

Mutation policy accepts `forbid`, `allow`, or `require`. Evaluators run only after candidate exit; expectations never enter candidate prompt or workspace. Each run creates a fresh session plus read-only `receipt.json`, derived `result.json`, and `report.md`. Fixture workspaces remain as artifacts; historical candidate trees are represented by receipt snapshots and removed. Set `PI_SUBAGENT_PI_BINARY` to substitute a Pi-compatible process shim.

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
