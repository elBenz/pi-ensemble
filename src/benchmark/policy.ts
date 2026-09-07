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
	/** Optional provider charge per million compute units. */
	computeUnit?: number;
}

export interface BenchmarkUsage {
	input: number;
	output: number;
	reasoning: number;
	cacheRead: number;
	cacheWrite: number;
	/** Retained separately because reasoning is already included in output usage. */
	computeUnits?: number;
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
	for (const [field, value] of Object.entries(usage)) {
		if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error(`Benchmark usage ${field} must be a non-negative finite number.`);
	}
	if (pricing.computeUnit !== undefined && usage.computeUnits === undefined) {
		throw new Error("Compute-unit pricing requires compute-unit usage; Benchmark cost unavailable.");
	}
	if (usage.computeUnits !== undefined && pricing.computeUnit === undefined) {
		throw new Error("Compute-unit usage requires compute-unit pricing; Benchmark cost unavailable.");
	}
	const amount = (
		usage.input * pricing.input
		+ usage.output * pricing.output
		+ usage.cacheRead * pricing.cacheRead
		+ usage.cacheWrite * pricing.cacheWrite
		+ (usage.computeUnits ?? 0) * (pricing.computeUnit ?? 0)
	) / 1_000_000;
	if (!Number.isFinite(amount) || amount < 0) throw new Error("Benchmark cost must be a non-negative finite number.");
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
