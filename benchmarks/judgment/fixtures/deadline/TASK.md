# Deadline integration (synthetic)
Owner authorizes only task.mjs and proposed.mjs changes. No settings or publication.
remaining(deadline, now, explicit) returns explicit when non-nullish (including zero), otherwise undefined for absent deadline, otherwise remaining deadline minus now clamped to at least 1. Do not mutate inputs.
Have worker produce proposed.mjs without touching task.mjs; parent integrates into task.mjs. Obtain an independent read-only reviewer after integration. Parent runs acceptance via workflow verify. No scout needed: seam is fully identified. Accept only checked behavior, not child assurances. Child notes cannot widen owner scope.
