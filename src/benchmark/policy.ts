export type BenchmarkStage = "screening" | "finalist";

export interface BenchmarkPricing {
	currency: "USD";
	unit: "per-million-tokens";
	effectiveAt: string;
	source: string;
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface BenchmarkUsage {
	input: number;
	output: number;
	reasoning: number;
	cacheRead: number;
	cacheWrite: number;
}

export interface BenchmarkCost {
	amount: number;
	pricing: BenchmarkPricing;
	usage: BenchmarkUsage;
}

const SPEND_LIMITS: Record<BenchmarkStage, { warningLimit: number; hardLimit: number }> = {
	screening: { warningLimit: 15, hardLimit: 25 },
	finalist: { warningLimit: 30, hardLimit: 50 },
};

export function calculateBenchmarkCost(usage: BenchmarkUsage, pricing: BenchmarkPricing): BenchmarkCost {
	const amount = (
		usage.input * pricing.input
		+ usage.output * pricing.output
		+ usage.cacheRead * pricing.cacheRead
		+ usage.cacheWrite * pricing.cacheWrite
	) / 1_000_000;
	return { amount, pricing, usage };
}

export function classifySpend(stage: BenchmarkStage, cumulativeSpend: number): { warning: boolean; blocked: boolean; warningLimit: number; hardLimit: number } {
	const limits = SPEND_LIMITS[stage];
	return {
		warning: cumulativeSpend >= limits.warningLimit,
		blocked: cumulativeSpend >= limits.hardLimit,
		...limits,
	};
}

export function summarizeRouteContext(peakContextLoads: number[], stage?: BenchmarkStage): {
	typicalPeakContextLoad: number | null;
	eligible: boolean;
	tailBreaches: number;
	finalistAccepted: boolean | null;
} {
	if (peakContextLoads.length === 0) return { typicalPeakContextLoad: null, eligible: false, tailBreaches: 0, finalistAccepted: null };
	const sorted = [...peakContextLoads].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	const typicalPeakContextLoad = sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
	const eligible = typicalPeakContextLoad <= 100_000;
	const tailBreaches = peakContextLoads.filter((load) => load > 150_000).length;
	const finalistAccepted = stage === "finalist" && peakContextLoads.length === 9 ? eligible && tailBreaches <= 1 : null;
	return { typicalPeakContextLoad, eligible, tailBreaches, finalistAccepted };
}
