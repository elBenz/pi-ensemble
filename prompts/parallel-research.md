---
description: Research external evidence and local implications in parallel
argument-hint: "[question or target]"
---

Question/target: $@

Build a grounded answer with fresh-context, read-only subagents.

Resolve any URL, path, or repository target first. Launch:
- one `researcher` for current primary-source evidence when external facts matter;
- one `scout` for local code, constraints, tests, and integration seams when repository context matters.

Add a third lane only for a genuinely independent evidence gap. Each task must name its angle, target, success criterion, and required evidence: source links for external claims; `path:line` ranges for local claims; confidence, gaps, and decision implication for both. Prefer current primary sources and record relevant publication/version dates.

After results return, synthesize:
- direct answer;
- local implications;
- tradeoffs and risks;
- disagreements or unsupported assumptions;
- recommended next move.

Finish when each material claim has evidence or is explicitly marked unresolved. No child edits.
