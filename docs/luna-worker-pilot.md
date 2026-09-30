# Project-local Luna worker pilot

Use the global `/luna-worker <bounded task or handoff path>` shortcut in this checkout after trusting
project configuration and `/reload`. Project `prompts: ["-prompts/luna-worker.md"]`
excludes the retained project copy, leaving the global shortcut active without a collision.
This is an explicit opt-in lightweight experiment, not the default worker route,
a new routing engine, or a global model profile. Global and project worker defaults use
GPT-6.1 Sol-medium with fresh context; only this recipe selects Luna.

- Parent/startup and delegated planning: GPT-6.1 Sol-high for scope, architecture,
  decisions and coordination. Confirm active parent selection before launch; startup settings
  do not switch an existing session. Planning adoption is controlled, not proven benchmark
  equivalence to Astra or guaranteed savings. Use the unchanged Astra-medium `oracle`
  for independent consequential advice.
- Pilot worker: GPT-6 Luna-medium, fresh context, existing worker persona.
- Failed executable acceptance: one fresh GPT-6.1 Sol-medium repair in the **same cwd** only when every host check completed normally (passed or failed with finite exit code), at least one failed, and any failed criterion is explicitly reported not-satisfied with evidence.
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

Run `/subagents-models delegate`, `/subagents-models worker` and
`/subagents-models reviewer`; expect Sol-high planning and Sol-medium fresh implementation,
with reviewer unchanged from the pre-pilot Astra-medium mapping. `pi --list-models luna` and `pi --list-models sol`
inspect the installed registry without inference. Do not use historical benchmark
runtime/catalog patches or refresh commands that issue paid probes.

Global and `.pi/settings.json` worker overrides set the normal worker to GPT-6.1 Sol-medium with fresh context.
Builtin overrides replace bundled `thinking: high`; custom worker frontmatter can
still outrank settings. This opt-in workflow explicitly requests Luna `:medium` and fresh
context for its first child, then `openai-codex/gpt-6.1-sol:medium` with fresh context for a qualifying repair.
Inspect resolved `results[].model`, `thinking`, `context` and distinct session files.
Project delegate override pins model/thinking and retains the existing Luna-medium provider
fallback explicitly: project role overrides replace global role overrides rather than merging.
Worker/delegate personas and
independent Astra-medium reviewer/oracle routes are preserved. Scout/researcher routes
and existing provider fallback chains remain unchanged.

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
remains GPT-6.1 Sol-medium. No global settings or agent persona need restoring.
