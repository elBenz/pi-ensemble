---
description: Implement/review/fix until clean or capped
argument-hint: "[target, implementation request, or round cap]"
---

Target/request: $@

Run a parent-controlled loop. Default cap: 3 review rounds. One writer owns the active cwd/worktree; all reviewers use fresh context and remain read-only.

1. **Implement:** when requested, launch one async `worker` with approved scope, evidence/context paths, success criteria, authority boundary, focused validation, and handoff requirements. Start at review when the current diff is the target.
2. **Review:** resolve changed paths and provide 1–3 `reviewer` agents the diff text/artifact or explicit file list. Choose distinct risk-based lenses. A round completes when every lens reports evidence-backed findings or clean status.
3. **Disposition:** classify every finding as blocker, fix now, optional, or defer/reject with reason. Ask me before any unapproved product, architecture, scope, or authority decision.
4. **Fix:** when implementation is authorized and fix-now items exist, launch one worker to apply only that synthesis and run focused validation.
5. **Repeat:** review again only after material fixes. Stop when no fix-now items remain, only optional/deferred feedback remains, a user decision blocks progress, or cap is reached.

Use `workflowScript` and async execution. As a conservative orchestration policy, do not pass `turnBudget`, a hard `toolBudget`, or a tight `usageBudget` to mutation-capable workers: default tool budget blocks read/search tools rather than mutation tools. Before an elapsed deadline, request a checkpoint after the current tool returns with changed files, build/test state, remaining work, and commit or PR state. Child handoffs are intermediate until the loop stop criterion is met.

At completion, inspect final diff, confirm focused validation, and report rounds, changes, evidence, deferred items, and stop reason.
