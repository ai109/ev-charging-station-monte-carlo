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
    droppedPrice: 0,

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
    droppedPrice: a.droppedPrice + b.droppedPrice,

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
    droppedPrice: a.droppedPrice * s,

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

export function gridSearch(
  params: StationParams,
  config: GridSearchConfig,
  onProgress?: (completed: number, total: number) => void,
): { results: GridPointResult[]; best: GridPointResult | null } {
  const { nGrid, pGrid, mcRuns, seed, maxDropRate, maxP95WaitMin } = config;

  const pValues = Array.from(priceGrid(pGrid.pMin, pGrid.pMax, pGrid.pStep));
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
      const p95Waits: number[] = [];

      let sum = kpiZero();

      for (let r = 0; r < mcRuns; r++) {
        const rng = new RNG((baseSeed + r * 1013904223) >>> 0);
        const kpi = simulateYear(params, N, p, rng);

        sum = addKpi(sum, kpi);

        profits.push(kpi.profit);

        const dropped =
          kpi.droppedPrice + kpi.droppedQueueFull + kpi.droppedWaitTol;
        const dr = kpi.arrivals > 0 ? dropped / kpi.arrivals : 0;
        dropRates.push(dr);

        p95Waits.push(kpi.p95WaitMin);
      }

      // Mean KPIs across runs
      const meanKpi = scaleKpi(sum, 1 / mcRuns);

      // For waits & utilization, averaging across runs is OK for display,
      // though you could later compute pooled percentiles from all waits if you store them.
      const point: GridPointResult = {
        N,
        p,
        mean: meanKpi,
        stderrProfit: stdErr(profits),
        stderrDropRate: stdErr(dropRates),
        dropRate: mean(dropRates),
      };

      results.push(point);

      // Constraints check (if provided)
      const okDrop =
        maxDropRate === undefined ? true : point.dropRate <= maxDropRate;
      const okWait =
        maxP95WaitMin === undefined ? true : mean(p95Waits) <= maxP95WaitMin;

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
