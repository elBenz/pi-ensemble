---
description: Adversarial review with distinct fresh-context lenses
argument-hint: "[target, focus, or autofix]"
---

Target/focus: $@

Resolve the target before fanout. For a diff, collect changed paths and provide reviewers the diff text/artifact or an explicit changed-file list; reviewers cannot infer unavailable Git evidence.

Launch 1–3 fresh-context `reviewer` agents. Choose only distinct high-value lenses from the actual target and user intent: correctness/regressions, tests/validation, simplicity, security/privacy, performance, docs/API contract, or user flow. Give each task the exact target, requirements, lens, evidence source, and completion criterion. Reviewers read source directly, cite `path:line`, suggest the smallest fix, and remain read-only.

Synthesize every finding as:
- fix now;
- optional;
- defer/reject, with reason;
- blocker requiring user decision.

`autofix` is workflow control, not scope. When present, apply only “fix now” items, validate affected paths, and report results. Otherwise ask before editing unless correction was already authorized. If asking, end:

```text
Reply [1], [2], or give instructions:
[1] Apply fixes worth doing now.
[2] Also apply optional improvements.
```

Finish when all findings are dispositioned and any applied fixes are validated.
