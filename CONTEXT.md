# Pi Ensemble

Pi Ensemble routes specialized agent roles through coordinated model runs. This language distinguishes role, model capability, reasoning effort, and evaluation policy.

## Language

**Agent role**:
A named responsibility with a characteristic workload, such as scout, worker, or reviewer.
_Avoid_: Agent, model

**Route**:
A pairing of an agent role with a model tier and thinking level.
_Avoid_: Model choice, mapping

**Model tier**:
A capability-and-price variant within one model family, such as GPT-5.6 Luna, Terra, or Sol.
_Avoid_: Thinking level, model role

**Thinking level**:
The requested reasoning-effort setting for a model run, independent of model tier.
_Avoid_: Intelligence, model tier

**Quality floor**:
The lowest acceptable task-success score for a route, expressed relative to the best eligible route for that workload.
_Avoid_: Best model, acceptable quality

**Benchmark cost**:
Estimated API spend per benchmark task from measured token usage and published input/output prices. It excludes subscription fees and quota consumption.
_Avoid_: Subscription cost, token count

**Cumulative output tokens**:
All model-generated tokens across a run. This measures generation volume but not the largest context presented in any one model call.
_Avoid_: Context load, context window

**Peak context load**:
The largest active context observed during a run, including relevant input and generated content.
_Avoid_: Output tokens, total tokens

**Context degradation threshold**:
The 150k-token peak-context boundary where a fresh session is required. Eligible routes target at most 100k typical peak context, preserving approximately 50k tokens for refinement.
_Avoid_: Context-window limit, output-token limit, dumb zone

**Tail breach**:
A run whose peak context load exceeds the context degradation threshold despite an acceptable typical load for its route. During finalist validation, at most one tail breach across nine runs is tolerated.
_Avoid_: Average context, automatic route failure

**Pareto candidate**:
An eligible route for which no alternative is at least as good in score, benchmark cost, cumulative output tokens, and peak context load while being strictly better in one or more.
_Avoid_: Best model, cheapest model

**Evidence anchor**:
The external benchmark used to shortlist routes before local validation; it informs routing but does not decide it alone.
_Avoid_: Ground truth, final test
