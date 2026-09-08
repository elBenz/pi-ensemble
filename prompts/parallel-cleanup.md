---
description: Parallel deslop and verbosity review
argument-hint: "[target or autofix]"
---

Target/focus: $@

Resolve the target and changed paths. For an explicit `/parallel-cleanup` invocation or request for parallel cleanup, launch two fresh-context, read-only `reviewer` tasks with `output: false`, one per lens below. When reusing this technique for small routine cleanup, inspect directly or use one reviewer covering both lenses; use two when independent review earns its cost. If delegation is unavailable or prohibited, apply both lenses directly and report the fallback:

1. **Deslop:** use `deslop` skill when available; otherwise inspect for redundant/generated comments or prose, masked errors, type escapes, duplicate structure, pass-through abstractions, debug residue, and local-style drift.
2. **Verbosity:** use `verbosity-cleaner` when available; otherwise inspect for needless indirection, temporary naming, branching, boilerplate, duplicated tests, and repeated prose while preserving behavior, cleanup semantics, invariants, and local clarity.

For delegated review, provide the diff text/artifact or explicit changed-file list plus relevant source. For direct review, inspect the same evidence. Require only concrete findings with severity, `path:line`, evidence, and smallest safe fix. Tool findings are leads, not verdicts.

Parent dispositions every finding as fix now, optional, or defer/reject with reason.

`autofix` is workflow control, not scope. When present, apply only fix-now items and validate. Otherwise apply in-scope repairs if cleanup was already authorized; for review-only work, return findings. If fixes need approval and actionable items remain, ask with:

```text
Reply [1], [2], or give instructions:
[1] Apply fixes worth doing now.
[2] Also apply optional improvements.
```

Finish when findings are dispositioned and applied fixes are validated.
