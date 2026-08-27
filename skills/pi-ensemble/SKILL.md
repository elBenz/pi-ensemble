---
name: pi-ensemble
description: Delegate and coordinate subagents for advisory review, recon, research, implementation, parallel analysis, and multi-step workflows while parent retains control.
---

# Pi Ensemble

Parent orchestrator only. Ordinary children execute assigned work; only an explicitly assigned fanout child may delegate within that lane.

Execute through `workflowScript`: `runs.run` for one child, `runs.all` for parallel children, ordinary JavaScript for sequencing and gates.

## Load one matching reference

Paths are relative to this file. Read another only when a concrete decision requires it.

| Branch | Reference |
| --- | --- |
| **Prompt/role selection:** whether to delegate, builtin roles, task contracts, prompt recipes, model tiering | `references/prompting-and-roles.md` |
| **Execution/control:** async, chaining, fork, resume, steering, schedules, missions, watchdog, intercom | `references/execution-controls.md` |
| **Authoring/management:** list or edit agents, refinements, prompt integration, extension RPC | `references/management-authoring-rpc.md` |
| **Safety/recipes:** authority, worktrees, one-writer patterns, Fable phases, error handling | `references/constraints-and-recipes.md` |

## Invariants

- Parent owns orchestration, acceptance, and unresolved decisions.
- One writer per cwd/worktree; parallelize read-only work unless writers are isolated intentionally.
- Cross-repo tasks name exact repo, `cwd`, authority boundary, and output.
- Fanout lanes need distinct goals/evidence, stable keys, and one aggregated workflow.
- Fresh context suits independent review; fork only when inherited conversation is required.
- Async is default. Foreground requires user-visible or foreground-only behavior.
- Preserve capability ceilings and escalate unapproved product, architecture, authority, release, merge, or safety decisions.
- Treat receipts and automated reviews as evidence, not operational authority.
- As a conservative orchestration policy, do not pass `turnBudget`, a hard `toolBudget`, or a tight `usageBudget` to mutation-capable workers. Default tool budget blocks read/search tools rather than mutation tools. Before an elapsed deadline, request a checkpoint after the current tool returns with changed files, build/test state, remaining work, and commit or PR state.
