import { RNG, mean } from "./rng";
import { simulateYear } from "./simYear";
import {
  type GridPointResult,
  type GridSearchConfig,
  type SimRunKPIs,
  type StationParams,
} from "./types";

function kpiZero(): SimRunKPIs {
  return {
    revenue: 0,
    energySoldKwh: 0,
    energyCost: 0,
    fixedCost: 0,
    profit: 0,

    arrivals: 0,
    served: 0,
    droppedQueueFull: 0,
    droppedWaitTol: 0,

    avgWaitMin: 0,
    p95WaitMin: 0,
    utilization: 0,
  };
}

function addKpi(a: SimRunKPIs, b: SimRunKPIs): SimRunKPIs {
  return {
    revenue: a.revenue + b.revenue,
    energySoldKwh: a.energySoldKwh + b.energySoldKwh,
    energyCost: a.energyCost + b.energyCost,
    fixedCost: a.fixedCost + b.fixedCost,
    profit: a.profit + b.profit,

    arrivals: a.arrivals + b.arrivals,
    served: a.served + b.served,
    droppedQueueFull: a.droppedQueueFull + b.droppedQueueFull,
    droppedWaitTol: a.droppedWaitTol + b.droppedWaitTol,

    // For waits/util we’ll average later across runs
    avgWaitMin: a.avgWaitMin + b.avgWaitMin,
    p95WaitMin: a.p95WaitMin + b.p95WaitMin,
    utilization: a.utilization + b.utilization,
  };
}

function scaleKpi(a: SimRunKPIs, s: number): SimRunKPIs {
  return {
    revenue: a.revenue * s,
    energySoldKwh: a.energySoldKwh * s,
    energyCost: a.energyCost * s,
    fixedCost: a.fixedCost * s,
    profit: a.profit * s,

    arrivals: a.arrivals * s,
    served: a.served * s,
    droppedQueueFull: a.droppedQueueFull * s,
    droppedWaitTol: a.droppedWaitTol * s,

    avgWaitMin: a.avgWaitMin * s,
    p95WaitMin: a.p95WaitMin * s,
    utilization: a.utilization * s,
  };
}

function stdErr(values: number[]): number {
  const n = values.length;
  if (n <= 1) return 0;
  const m = mean(values);
  let ss = 0;
  for (const x of values) ss += (x - m) * (x - m);
  const variance = ss / (n - 1);
  const sd = Math.sqrt(variance);
  return sd / Math.sqrt(n);
}

function* priceGrid(
  pMin: number,
  pMax: number,
  step: number,
): Generator<number> {
  // inclusive grid with floating stability
  const steps = Math.floor((pMax - pMin) / step + 0.5);
  for (let i = 0; i <= steps; i++) {
    const p = pMin + i * step;
    // round to cents-ish to avoid floating drift
    yield Math.round(p * 1000) / 1000;
  }
}

function validateConfig(config: GridSearchConfig): void {
  const { nGrid, pGrid, mcRuns, maxDropRate, maxP95WaitMin } = config;

  if (!Number.isFinite(nGrid.nMin) || !Number.isFinite(nGrid.nMax)) {
    throw new Error("N grid bounds must be finite numbers.");
  }
  if (!Number.isFinite(pGrid.pMin) || !Number.isFinite(pGrid.pMax)) {
    throw new Error("Price grid bounds must be finite numbers.");
  }
  if (!Number.isFinite(pGrid.pStep) || pGrid.pStep <= 0) {
    throw new Error("Price step must be > 0.");
  }
  if (pGrid.pMin <= 0 || pGrid.pMax <= 0) {
    throw new Error("Price grid bounds must be strictly positive.");
  }
  if (nGrid.nMin < 1 || nGrid.nMax < 1) {
    throw new Error("N grid bounds must be >= 1.");
  }
  if (nGrid.nMin > nGrid.nMax) {
    throw new Error("N min cannot be greater than N max.");
  }
  if (pGrid.pMin > pGrid.pMax) {
    throw new Error("Price min cannot be greater than price max.");
  }
  if (!Number.isFinite(mcRuns) || mcRuns < 1) {
    throw new Error("Monte Carlo runs must be >= 1.");
  }
  if (maxDropRate !== undefined && (maxDropRate < 0 || maxDropRate > 1)) {
    throw new Error("maxDropRate must be in [0, 1].");
  }
  if (maxP95WaitMin !== undefined && maxP95WaitMin < 0) {
    throw new Error("maxP95WaitMin must be >= 0.");
  }
}

function validateStationParams(params: StationParams): void {
  if (!Number.isFinite(params.pRef) || params.pRef <= 0) {
    throw new Error("pRef must be strictly positive.");
  }
  if (
    !Number.isFinite(params.priceElasticity) ||
    params.priceElasticity <= 0
  ) {
    throw new Error("priceElasticity must be strictly positive.");
  }
  if (params.baseArrivalsPerHourByMonth.length < 12) {
    throw new Error("baseArrivalsPerHourByMonth must provide 12 months.");
  }
  if (params.avgTempCByMonth.length < 12) {
    throw new Error("avgTempCByMonth must provide 12 months.");
  }
  if (!Number.isFinite(params.powerKw) || params.powerKw <= 0) {
    throw new Error("powerKw must be strictly positive.");
  }
  if (!Number.isFinite(params.qMax) || params.qMax < 0) {
    throw new Error("qMax must be >= 0.");
  }
  if (!Number.isFinite(params.openHours) || params.openHours < 1 || params.openHours > 24) {
    throw new Error("openHours must be in [1, 24].");
  }
  if (!Number.isFinite(params.gridCostPerKwh) || params.gridCostPerKwh < 0) {
    throw new Error("gridCostPerKwh must be >= 0.");
  }
  if (!Number.isFinite(params.fixedCostPerYear) || params.fixedCostPerYear < 0) {
    throw new Error("fixedCostPerYear must be >= 0.");
  }
  if (
    !Number.isFinite(params.fixedCostPerStallPerYear) ||
    params.fixedCostPerStallPerYear < 0
  ) {
    throw new Error("fixedCostPerStallPerYear must be >= 0.");
  }
  if (!Number.isFinite(params.energyKwhStd) || params.energyKwhStd < 0) {
    throw new Error("energyKwhStd must be >= 0.");
  }
  if (!Number.isFinite(params.energyKwhMin) || params.energyKwhMin < 0) {
    throw new Error("energyKwhMin must be >= 0.");
  }
  if (!Number.isFinite(params.energyKwhMax) || params.energyKwhMax <= 0) {
    throw new Error("energyKwhMax must be > 0.");
  }
  if (
    params.energyKwhMin > params.energyKwhMean ||
    params.energyKwhMean > params.energyKwhMax
  ) {
    throw new Error("Energy bounds must satisfy min <= mean <= max.");
  }
  if (!Number.isFinite(params.waitTolStdMin) || params.waitTolStdMin < 0) {
    throw new Error("waitTolStdMin must be >= 0.");
  }
  if (!Number.isFinite(params.waitTolMin) || params.waitTolMin < 0) {
    throw new Error("waitTolMin must be >= 0.");
  }
  if (!Number.isFinite(params.waitTolMax) || params.waitTolMax <= 0) {
    throw new Error("waitTolMax must be > 0.");
  }
  if (
    params.waitTolMin > params.waitTolMeanMin ||
    params.waitTolMeanMin > params.waitTolMax
  ) {
    throw new Error("Wait tolerance bounds must satisfy min <= mean <= max.");
  }

  for (let month = 0; month < 12; month++) {
    const base = params.baseArrivalsPerHourByMonth[month];
    if (!Number.isFinite(base) || base <= 0) {
      throw new Error(
        `baseArrivalsPerHourByMonth[${month}] must be strictly positive.`,
      );
    }
  }
}

export function gridSearch(
  params: StationParams,
  config: GridSearchConfig,
  onProgress?: (completed: number, total: number) => void,
): { results: GridPointResult[]; best: GridPointResult | null } {
  validateConfig(config);
  validateStationParams(params);

  const { nGrid, pGrid, mcRuns, seed, maxDropRate, maxP95WaitMin } = config;

  const pValues = Array.from(priceGrid(pGrid.pMin, pGrid.pMax, pGrid.pStep));
  if (pValues.length === 0) {
    throw new Error("Price grid produced zero points.");
  }
  const total = (nGrid.nMax - nGrid.nMin + 1) * pValues.length;

  const results: GridPointResult[] = [];
  let completed = 0;

  // Global best under constraints
  let best: GridPointResult | null = null;

  for (let N = nGrid.nMin; N <= nGrid.nMax; N++) {
    for (const p of pValues) {
      // Use a deterministic seed per grid point for reproducibility
      const baseSeed = hashSeed(seed, N, p);

      const profits: number[] = [];
      const dropRates: number[] = [];

      let sum = kpiZero();

      for (let r = 0; r < mcRuns; r++) {
        const rng = new RNG((baseSeed + r * 1013904223) >>> 0);
        const kpi = simulateYear(params, N, p, rng);

        sum = addKpi(sum, kpi);

        profits.push(kpi.profit);

        const dropped = kpi.droppedQueueFull + kpi.droppedWaitTol;
        const dr = kpi.arrivals > 0 ? dropped / kpi.arrivals : 0;
        dropRates.push(dr);
      }

      // Mean KPIs across runs
      const meanKpi = scaleKpi(sum, 1 / mcRuns);
      const meanDropped = meanKpi.droppedQueueFull + meanKpi.droppedWaitTol;
      const dropRate = meanKpi.arrivals > 0 ? meanDropped / meanKpi.arrivals : 0;

      // For waits & utilization, averaging across runs is OK for display,
      // though you could later compute pooled percentiles from all waits if you store them.
      const point: GridPointResult = {
        N,
        p,
        mean: meanKpi,
        stderrProfit: stdErr(profits),
        stderrDropRate: stdErr(dropRates),
        dropRate,
      };

      results.push(point);

      // Constraints check (if provided)
      const okDrop =
        maxDropRate === undefined ? true : point.dropRate <= maxDropRate;
      const okWait =
        maxP95WaitMin === undefined
          ? true
          : point.mean.p95WaitMin <= maxP95WaitMin;

      if (okDrop && okWait) {
        if (!best || point.mean.profit > best.mean.profit) best = point;
      }

      completed++;
      onProgress?.(completed, total);
    }
  }

  return { results, best };
}

// Deterministic hash-like seed mixer
function hashSeed(seed: number, N: number, p: number): number {
  // convert p to mills to keep stable
  const pm = Math.round(p * 1000);
  let x = (seed ^ (N * 374761393) ^ (pm * 668265263)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}
