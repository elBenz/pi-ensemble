---
description: Explicit opt-in lightweight Luna worker experiment with host acceptance and one Sol repair
argument-hint: "<bounded task or handoff path>"
---
Run the explicit opt-in lightweight worker experiment for: $@. This does not change the project GPT-6.1 Sol-medium worker default.

Read `docs/luna-worker-pilot.md` and `src/workflows/luna-worker-pilot.ts` before launching. Parent retains current model/thinking selection for scope, architecture, unresolved requirements and integration; use the existing Astra-medium oracle for consequential advice and retain existing reviewer mapping.

Build the contract from the requested behavior, relevant entry points, preservation invariants, allowed files/non-goals, clarification conditions and independent acceptance commands. Resolve material ambiguity with the user first. Worker owns investigation, implementation and tests; give a contract rather than prescribed patches.

Generate tool parameters with `buildLunaWorkerPilot`, then submit the generated object to `subagent`. Keep `async: true`; one writer owns the cwd until completion. Parent may inspect unrelated files but must not edit the active workspace. Use the runtime's completion notification rather than polling.

Consume the pilot receipt and evidence. `review-ready` means host verification passed, not permission to integrate: arrange risk-appropriate fresh review using unchanged reviewer mapping. `parent-decision` means stop automatic repair and assess concrete evidence with the user where scope/authority is unresolved. Preserve all workspace changes and artifacts. Host owns telemetry and accounting; unavailable child counters never justify abandoning implementation or skipping review. No commits, publication or paid benchmark runs are authorized by this template.
