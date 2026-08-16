# pi-ensemble

Safe multi-agent delegation and scripted orchestration for [Pi](https://github.com/earendil-works/pi).

`pi-ensemble` runs focused child Pi sessions for code review, research, implementation, parallel audits, background jobs, and reusable workflows. Children run with explicit context and capability boundaries. Parent context receives bounded receipts while full output stays in inspectable artifacts.

## Install

```bash
pi install https://github.com/elBenz/pi-ensemble
```

For local development:

```bash
pi install /absolute/path/to/pi-ensemble
```

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
- Scripted sequential, parallel, branching, and retry workflows
- Bounded model-facing receipts backed by full output artifacts
- Capability ceilings, replay barriers, mission locking, and hardened supervisor messaging
- Fleet status, live inspection, steering, stopping, and durable run records

Installing the extension does not start autonomous work. It adds delegation and orchestration capabilities controlled by the parent session.

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

## Compatibility

The model-facing tool remains `subagent`; existing workflow payloads and `/subagents-*` commands remain compatible. Internal `pi-subagents.*` registry keys and established storage paths are intentionally retained where changing them would break interoperability or existing run state.

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

## Lineage

`pi-ensemble` is an independent MIT-licensed fork of [nicobailon/pi-subagents](https://github.com/nicobailon/pi-subagents). It preserves upstream history, copyright, and attribution. The fork focuses on hardened execution boundaries, bounded parent-context impact, explicit orchestration authority, and maintainable compatibility.

## License

[MIT](LICENSE)
