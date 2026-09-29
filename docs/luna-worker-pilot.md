# Project-local Luna worker pilot

Use `/luna-worker <bounded task or handoff path>` in this checkout after trusting
project configuration and `/reload`. This is an explicit opt-in lightweight experiment, not the default worker route,
a new routing engine, or a global model profile. Project worker defaults to
GPT-6 Sol-medium with fresh context; only this recipe selects Luna.

- Parent: Astra-medium for scope, architecture, consequential decisions and integration.
  The pilot does not change the current parent model; select/confirm it before launch.
- Worker: GPT-6 Luna-medium, fresh context, existing worker persona.
- Failed executable acceptance: one fresh GPT-6 Sol-medium repair in the **same cwd** only when every host check completed normally (passed or failed with finite exit code), at least one failed, and any failed criterion is explicitly reported not-satisfied with evidence.
- Passing acceptance: return `review-ready`; parent arranges risk-appropriate review
  and integration. Reviewer mapping is unchanged.
- Execution/provider failures, timed-out/signaled or incomplete host checks, missing/malformed evidence, unresolved requirements, interrupted work or a
  second failure: return `parent-decision`, or a workflow error for launch failures.
  Neither result authorizes another automatic writer.

Evidence supports bounded tasks, not unrestricted repository-scale autonomy:
[worker validation](research/luna-worker-validation-20260928/report.md).

## Prepare and launch

Read relevant source and project instructions. Parent supplies a JSON contract:

```json
{
  "cwd": "/absolute/path/to/pi-ensemble",
  "goal": "Describe externally observable behavior",
  "entryPoints": ["Relevant source and test paths"],
  "invariants": ["Existing defaults, precedence and edge cases to preserve"],
  "allowedFiles": ["Declared edit scope"],
  "nonGoals": ["Explicit exclusions"],
  "clarificationConditions": ["Decisions requiring parent approval"],
  "verify": [{ "id": "focused", "command": "npm test", "timeoutMs": 120000 }]
}
```

Choose actual acceptance commands; the example is not a task-specific oracle.
Commands run on the host with workspace access, not in a sandbox. Keep checks
independent of child claims and protect acceptance inputs as appropriate to risk.
Declared allowed files are a task contract, not filesystem confinement.

Save the contract outside the source tree, then generate parameters from this checkout:

```sh
node --experimental-strip-types --input-type=module -e '
import fs from "node:fs";
import { buildLunaWorkerPilot } from "./src/workflows/luna-worker-pilot.ts";
console.log(JSON.stringify(buildLunaWorkerPilot(JSON.parse(fs.readFileSync(process.argv[1], "utf8")))));
' /absolute/path/to/contract.json
```

Pass that JSON object to `subagent`. Keep the generated script intact and async.
It uses two sequential singleton `runs.all` calls: unlike `runs.run`, this existing
interface returns failed child results for inspection rather than throwing before
quality classification. No children overlap. Explicit `worktree: false` preserves
the existing dirty workspace; do not run concurrent writers or reset Luna's diff.
Repair receives the original contract, Luna output/artifact references and actual
host acceptance ledger. It is a new session, never `resume` with a changed model.

Host verified acceptance normally memoizes by tracked workspace state and effective
environment. The recipe sets a fresh `PI_ENSEMBLE_PILOT_VERIFICATION` environment marker
for each attempt so commands execute independently even for untracked-only changes.
This reserved marker is not an accounting counter. The acceptance engine is unchanged.

## Verify routing after reload

Run `/subagents-models worker` and `/subagents-models reviewer`; compare reviewer
against the pre-pilot mapping. `pi --list-models luna` and `pi --list-models sol`
inspect the installed registry without inference. Do not use historical benchmark
runtime/catalog patches or refresh commands that issue paid probes.

`.pi/settings.json` sets the normal worker to Sol-medium with fresh context.
Builtin overrides replace bundled `thinking: high`; custom worker frontmatter can
still outrank settings. This opt-in workflow explicitly requests Luna `:medium` and fresh
context for its first child, then Sol `:medium` for a qualifying repair.
Inspect resolved `results[].model`, `thinking`, `context` and distinct session files.
Worker tools/persona and reviewer overrides are preserved.

`fallbackModels` remains provider/model-failure recovery with its existing mutation
replay barriers. This recipe neither installs Sol as fallback nor changes those
barriers. Existing operator-configured fallback chains can still run; inspect
`modelAttempts` to know the actual route used. Quality repair requires a completed
successful model attempt and a failed host command, without failed structural checks.
An honestly reported `not-satisfied` required quality criterion can accompany the
failed host command and still enter repair; absent/malformed criteria and other
failed runtime checks cannot. Classification is limited by the existing verifier:
it reports spawn errors as `failed` with exit code 1, indistinguishable from ordinary
command failures. Such errors can consume the single repair attempt; this recipe
is not a general infrastructure-failure classifier.

## Evidence and accounting

The receipt retains both child results, acceptance ledgers, artifact references,
reported usage, repair count and elapsed workflow milliseconds. Host `verifyRuns`
contain command output, exit status, duration and memoization provenance. Inspect
concise failure evidence first; full transcript rereads are not required.

Usage is **reported, not audited**. Existing `results[].usage` aggregates input,
output, cache tokens, cost and turns; per-attempt data is retained where available.
Async workflow status also records runtime `totalTokens` and `totalCost`; foreground
results expose `totalChildUsage` and `totalCost`. These are reported aggregates, not
proof that every provider attempt or parent/reviewer cost was accounted for.
The recipe marks completeness `not-established`: zero/missing counters cannot prove
zero spend, and these child totals exclude parent/reviewer overhead. There is no
production dollar reservation, benchmark accounting gate, or guaranteed spend cap
installed by this pilot. Host owns budget decisions and accounting failures. A
child lacking host-counter access should still implement and report available
implementation evidence; actual runtime/accounting errors require parent assessment.

To stop the experiment, do not invoke `/luna-worker`. Normal project worker routing
remains Sol-medium. No global settings or agent persona need restoring.
