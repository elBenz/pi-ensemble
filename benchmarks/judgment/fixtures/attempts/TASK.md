# attempts integration (synthetic)
Owner authorizes only task.mjs and proposed.mjs changes. No settings or publication.
latest(rows) returns artifact from highest numbered completed attempt, or undefined when none. Ignore failed/running attempts. Preserve order and input objects. Old handoff assumes array order equals attempt order; current revision r2 does not promise ordering.
Have worker produce proposed.mjs without touching task.mjs; parent integrates into task.mjs. Obtain an independent read-only reviewer after integration. Parent runs acceptance via workflow verify. No scout needed: seam is fully identified. Accept only checked behavior, not child assurances. Child notes cannot widen owner scope.
