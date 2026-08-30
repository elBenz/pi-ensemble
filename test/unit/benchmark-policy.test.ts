import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateBenchmarkCost, classifySpend, summarizeRouteContext } from "../../src/benchmark/policy.ts";

const pricing = {
	currency: "USD" as const,
	unit: "per-million-tokens" as const,
	effectiveAt: "2026-08-27",
	source: "https://example.invalid/pricing",
	input: 2,
	output: 8,
	cacheRead: 0.2,
	cacheWrite: 2.5,
};

describe("benchmark policy", () => {
	it("reprices reported usage with auditable current metadata without double-counting reasoning", () => {
		const cost = calculateBenchmarkCost({ input: 1_000_000, output: 500_000, reasoning: 400_000, cacheRead: 250_000, cacheWrite: 100_000 }, pricing);
		assert.equal(cost.amount, 6.3);
		assert.deepEqual(cost.pricing, pricing);
		assert.deepEqual(cost.usage, { input: 1_000_000, output: 500_000, reasoning: 400_000, cacheRead: 250_000, cacheWrite: 100_000 });
	});

	it("uses median Peak context load and classifies 100k eligibility and 150k Tail breaches", () => {
		assert.deepEqual(summarizeRouteContext([90_000, 100_000, 110_000]), {
			typicalPeakContextLoad: 100_000,
			eligible: true,
			tailBreaches: 0,
			finalistAccepted: null,
		});
		assert.deepEqual(summarizeRouteContext([90_000, 100_001, 150_000]), {
			typicalPeakContextLoad: 100_001,
			eligible: false,
			tailBreaches: 0,
			finalistAccepted: null,
		});
		assert.deepEqual(summarizeRouteContext([80_000, 90_000, 95_000, 100_000, 110_000, 151_000, 152_000, 99_000, 98_000], "finalist"), {
			typicalPeakContextLoad: 99_000,
			eligible: true,
			tailBreaches: 2,
			finalistAccepted: false,
		});
	});

	it("warns and blocks new launches at inclusive stage boundaries", () => {
		assert.deepEqual(classifySpend("screening", 14.999), { warning: false, blocked: false, warningLimit: 15, hardLimit: 25 });
		assert.deepEqual(classifySpend("screening", 15), { warning: true, blocked: false, warningLimit: 15, hardLimit: 25 });
		assert.deepEqual(classifySpend("screening", 25), { warning: true, blocked: true, warningLimit: 15, hardLimit: 25 });
		assert.deepEqual(classifySpend("finalist", 30), { warning: true, blocked: false, warningLimit: 30, hardLimit: 50 });
		assert.deepEqual(classifySpend("finalist", 50), { warning: true, blocked: true, warningLimit: 30, hardLimit: 50 });
	});
});
