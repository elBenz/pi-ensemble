# Model guidance and benchmark refresh

Research captured 2026-09-07. Proposal only; issues, runtime configuration, and benchmark code unchanged.

**Follow-up supersedes initial evidence gaps:** [Full 20-configuration comparison](deepswe-refresh/comparison.md) now captures all five efforts for Astra, Sol, Terra, and Luna from the official v1.1 machine artifact. Raw source, provenance, normalized rows, site repricing excerpt, and offline analysis script are retained alongside it. Astra peak-context values are null. Astra costs include compute-unit charges, requiring more than the existing token-only cost model for faithful repricing.

## Findings

- [GPT-6 Astra guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra) documents `gpt-6-astra`, requires Responses for tool calling, does not support `none` effort, and recommends auditing skills/instructions, explicit delegation guidance, clear autonomy boundaries, and proportionate verification. API documentation alone does not establish support through Pi's OpenAI Codex adapter.
- [GPT-5.6 guidance](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.6) identifies Sol, Terra, and Luna; recommends matched-workload effort comparisons and leaner prompts. Its internal prompt-efficiency gains are directional, not evidence of gains in this repository.
- GPT-5.6 guidance distinguishes reasoning effort from standard/pro execution mode. Record mode when available; do not silently merge distinct configurations.
- [Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching) and GPT-5.6 guidance describe separately billed cache writes. Preserve uncached input, cache reads, cache writes, and output usage alongside dated pricing. Reasoning tokens already included in output must not be charged twice. Raw Responses input accounting and Pi-normalized usage must be mapped explicitly rather than assumed identical.
- [DeepSWE v1.1](https://deepswe.datacurve.ai/blog/deepswe-v1-1) and its [official repository](https://github.com/datacurve-ai/deep-swe) provide external coding-harness evidence, not local Pi role validation.

## Repository implications

- HEAD `d66cb31` implements issue 12 context/spend policy. `src/benchmark/policy.ts` already separates input, output, cache-read, and cache-write prices; reasoning is retained separately without an additional charge. Adapter correctness remains a distinct verification question.
- [Issue 13](https://github.com/elBenz/pi-ensemble/issues/13) and [parent issue 9](https://github.com/elBenz/pi-ensemble/issues/9) explicitly restrict candidates to GPT-5.6. Including Astra in route selection requires a deliberate scope update, not an implicit change during import implementation.
- Preserve existing fifteen GPT-5.6 configurations as the specified baseline. Extend evidence normalization to accept additional explicitly identified models without assuming missing results are zero or dominated.
- Treat Astra as a proposed local challenger, pending provider/model/effort support verification. Missing external evidence should remain “unverified”; it need not permanently prohibit local testing. External evidence alone cannot authorize a recommended route.
- Snapshot official machine artifacts with source URL, retrieval time, source generation time when available, and content hash. Keep historical cost and current repricing distinct. Report insufficient usage/pricing data as unavailable, not free.
- Keep existing 100k typical-context target, 150k tail boundary, and spend guards until local evidence and an explicit policy decision justify changing them. A larger advertised model window does not invalidate the operational policy.
- Evaluate prompt changes separately from model changes: freeze the current prompt/tool setup for baseline comparisons, then run matched prompt variants. Record prompt/tool configuration identity so results stay comparable.
- Consider new native async tools, steering, persisted reasoning, and pro mode separately from the evidence importer. Verify adapter support before adopting API capabilities.

## Evidence gaps / next steps

1. Completed: retrieve and preserve official v1.1 machine artifact. All 20 GPT rows verified; exact values analyzed in the linked comparison. Remaining gap: Astra per-run peak context and tail behavior, absent from aggregate source.
2. Inspect Pi's runtime model catalog and adapter support without launching a paid benchmark. Documentation examples alone cannot establish availability or absence.
3. Propose coordinated updates to issues 9 and 13: retain GPT-5.6 baseline, permit verified Astra evidence, distinguish missing evidence from ineligibility, and keep local validation authoritative.
4. Audit prompt duplication, delegation instructions, approval boundaries, and verification guidance as a separate measured change. Preserve project capability ceilings and parent-owned orchestration; do not copy generic recursive-delegation examples blindly.

No paid benchmark candidates launched. Background research used a model-backed agent; that is distinct from benchmark execution.
