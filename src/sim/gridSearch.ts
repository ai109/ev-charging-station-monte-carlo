import { RNG, mean } from "./rng";
import { simulateYear } from "./simYear";
import {
  type GridPointResult,
  type GridSearchConfig,
  type SimRunKPIs,
  type StationParams,
  type SensitivityResult,
  type YearProjection,
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
    demandChargeCost: 0,
    solarGenerationKwh: 0,
    solarSelfConsumptionKwh: 0,
    batteryCycles: 0,
    peakDemandKw: 0,
    chargerDowntimeHours: 0,
    averagePricePerKwh: 0,
    servedByClass: {},
    revenueByClass: {},
  };
}

function addKpi(a: SimRunKPIs, b: SimRunKPIs): SimRunKPIs {
  const result: SimRunKPIs = {
    revenue: a.revenue + b.revenue,
    energySoldKwh: a.energySoldKwh + b.energySoldKwh,
    energyCost: a.energyCost + b.energyCost,
    fixedCost: a.fixedCost + b.fixedCost,
    profit: a.profit + b.profit,
    arrivals: a.arrivals + b.arrivals,
    served: a.served + b.served,
    droppedQueueFull: a.droppedQueueFull + b.droppedQueueFull,
    droppedWaitTol: a.droppedWaitTol + b.droppedWaitTol,
    avgWaitMin: a.avgWaitMin + b.avgWaitMin,
    p95WaitMin: a.p95WaitMin + b.p95WaitMin,
    utilization: a.utilization + b.utilization,
    demandChargeCost: a.demandChargeCost + b.demandChargeCost,
    solarGenerationKwh: a.solarGenerationKwh + b.solarGenerationKwh,
    solarSelfConsumptionKwh:
      a.solarSelfConsumptionKwh + b.solarSelfConsumptionKwh,
    batteryCycles: a.batteryCycles + b.batteryCycles,
    peakDemandKw: Math.max(a.peakDemandKw, b.peakDemandKw),
    chargerDowntimeHours: a.chargerDowntimeHours + b.chargerDowntimeHours,
    averagePricePerKwh: a.averagePricePerKwh + b.averagePricePerKwh,
    servedByClass: { ...a.servedByClass },
    revenueByClass: { ...a.revenueByClass },
  };

  // Merge class tracking
  for (const key of Object.keys(b.servedByClass)) {
    result.servedByClass[key] =
      (result.servedByClass[key] || 0) + b.servedByClass[key];
  }
  for (const key of Object.keys(b.revenueByClass)) {
    result.revenueByClass[key] =
      (result.revenueByClass[key] || 0) + b.revenueByClass[key];
  }

  return result;
}

function scaleKpi(a: SimRunKPIs, s: number): SimRunKPIs {
  const result: SimRunKPIs = {
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
    demandChargeCost: a.demandChargeCost * s,
    solarGenerationKwh: a.solarGenerationKwh * s,
    solarSelfConsumptionKwh: a.solarSelfConsumptionKwh * s,
    batteryCycles: a.batteryCycles * s,
    peakDemandKw: a.peakDemandKw,
    chargerDowntimeHours: a.chargerDowntimeHours * s,
    averagePricePerKwh: a.averagePricePerKwh * s,
    servedByClass: {},
    revenueByClass: {},
  };

  for (const key of Object.keys(a.servedByClass)) {
    result.servedByClass[key] = a.servedByClass[key] * s;
  }
  for (const key of Object.keys(a.revenueByClass)) {
    result.revenueByClass[key] = a.revenueByClass[key] * s;
  }

  return result;
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

// Calculate confidence interval
function confidenceInterval(
  values: number[],
  confidence: number = 0.95,
): [number, number] {
  if (values.length === 0) return [0, 0];
  const sorted = [...values].sort((a, b) => a - b);
  const alpha = 1 - confidence;
  const lowerIdx = Math.floor((alpha / 2) * sorted.length);
  const upperIdx = Math.ceil((1 - alpha / 2) * sorted.length - 1);
  return [sorted[lowerIdx], sorted[upperIdx]];
}

// Calculate Value at Risk and Conditional VaR
function calculateVaR(values: number[], percentile: number = 0.05): number {
  if (values.length === 0) return 0;
  return values.sort((a, b) => a - b)[Math.floor(percentile * values.length)];
}

function calculateCVaR(values: number[], percentile: number = 0.05): number {
  if (values.length === 0) return 0;
  const sorted = values.sort((a, b) => a - b);
  const cutoffIdx = Math.floor(percentile * sorted.length);
  const tailValues = sorted.slice(0, cutoffIdx + 1);
  return mean(tailValues);
}

function* priceGrid(
  pMin: number,
  pMax: number,
  step: number,
): Generator<number> {
  const steps = Math.floor((pMax - pMin) / step + 0.5);
  for (let i = 0; i <= steps; i++) {
    const p = pMin + i * step;
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
  if (!Number.isFinite(params.priceElasticity) || params.priceElasticity <= 0) {
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
  if (
    !Number.isFinite(params.openHours) ||
    params.openHours < 1 ||
    params.openHours > 24
  ) {
    throw new Error("openHours must be in [1, 24].");
  }
  if (!Number.isFinite(params.gridCostPerKwh) || params.gridCostPerKwh < 0) {
    throw new Error("gridCostPerKwh must be >= 0.");
  }
  if (
    !Number.isFinite(params.fixedCostPerYear) ||
    params.fixedCostPerYear < 0
  ) {
    throw new Error("fixedCostPerYear must be >= 0.");
  }
  if (
    !Number.isFinite(params.fixedCostPerStallPerYear) ||
    params.fixedCostPerStallPerYear < 0
  ) {
    throw new Error("fixedCostPerStallPerYear must be >= 0.");
  }

  // Validate vehicle classes
  if (!params.vehicleClasses || params.vehicleClasses.length === 0) {
    throw new Error("At least one vehicle class must be configured.");
  }

  let totalProportion = 0;
  for (const vc of params.vehicleClasses) {
    if (!Number.isFinite(vc.proportion) || vc.proportion < 0) {
      throw new Error(`Vehicle class ${vc.id} must have proportion >= 0.`);
    }
    totalProportion += vc.proportion;

    if (
      !Number.isFinite(vc.energyKwhMean) ||
      vc.energyKwhMean < 0
    ) {
      throw new Error(
        `Vehicle class ${vc.id} must have valid energyKwhMean.`,
      );
    }
    if (!Number.isFinite(vc.energyKwhStd) || vc.energyKwhStd < 0) {
      throw new Error(
        `Vehicle class ${vc.id} must have valid energyKwhStd.`,
      );
    }
    if (
      !Number.isFinite(vc.energyKwhMin) ||
      vc.energyKwhMin < 0
    ) {
      throw new Error(
        `Vehicle class ${vc.id} must have valid energyKwhMin.`,
      );
    }
    if (!Number.isFinite(vc.energyKwhMax) || vc.energyKwhMax <= 0) {
      throw new Error(
        `Vehicle class ${vc.id} must have valid energyKwhMax.`,
      );
    }
    if (
      vc.energyKwhMin > vc.energyKwhMean ||
      vc.energyKwhMean > vc.energyKwhMax
    ) {
      throw new Error(
        `Vehicle class ${vc.id} energy bounds must satisfy min <= mean <= max.`,
      );
    }
  }

  if (Math.abs(totalProportion - 1.0) > 0.01) {
    throw new Error("Vehicle class proportions must sum to 1.0.");
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

  // Validate TOU schedule if provided
  if (params.touSchedule && params.touSchedule.length > 0) {
    for (const period of params.touSchedule) {
      if (period.hourStart < 0 || period.hourEnd > 24) {
        throw new Error("TOU period hours must be in [0, 24].");
      }
      if (period.hourStart >= period.hourEnd) {
        throw new Error("TOU period hourStart must be < hourEnd.");
      }
      if (!Number.isFinite(period.costPerKwh) || period.costPerKwh < 0) {
        throw new Error("TOU period costPerKwh must be >= 0.");
      }
    }
  }
}

export function gridSearch(
  params: StationParams,
  config: GridSearchConfig,
  onProgress?: (completed: number, total: number) => void,
): {
  results: GridPointResult[];
  best: GridPointResult | null;
  projections?: YearProjection[];
  sensitivity?: SensitivityResult[];
} {
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
  let best: GridPointResult | null = null;

  for (let N = nGrid.nMin; N <= nGrid.nMax; N++) {
    for (const p of pValues) {
      const baseSeed = hashSeed(seed, N, p);

      const profits: number[] = [];
      const dropRates: number[] = [];
      const revenues: number[] = [];

      let sum = kpiZero();

      for (let r = 0; r < mcRuns; r++) {
        const rng = new RNG((baseSeed + r * 1013904223) >>> 0);
        const kpi = simulateYear(params, N, p, rng);

        sum = addKpi(sum, kpi);

        profits.push(kpi.profit);

        const dropped = kpi.droppedQueueFull + kpi.droppedWaitTol;
        const dr = kpi.arrivals > 0 ? dropped / kpi.arrivals : 0;
        dropRates.push(dr);
        revenues.push(kpi.revenue);
      }

      const meanKpi = scaleKpi(sum, 1 / mcRuns);
      const meanDropped = meanKpi.droppedQueueFull + meanKpi.droppedWaitTol;
      const dropRate =
        meanKpi.arrivals > 0 ? meanDropped / meanKpi.arrivals : 0;

      // Calculate confidence intervals
      const profitCI = confidenceInterval(profits, 0.95);
      const dropRateCI = confidenceInterval(dropRates, 0.95);
      const revenueCI = confidenceInterval(revenues, 0.95);

      // Calculate risk metrics
      const profitVaR95 = calculateVaR(profits, 0.05);
      const profitCVaR95 = calculateCVaR(profits, 0.05);
      const worstCaseProfit = Math.min(...profits);

      const point: GridPointResult = {
        N,
        p,
        mean: meanKpi,
        stderrProfit: stdErr(profits),
        stderrDropRate: stdErr(dropRates),
        dropRate,
        profitCI,
        dropRateCI,
        revenueCI,
        profitVaR95,
        profitCVaR95,
        worstCaseProfit,
        profitDistribution: profits,
        dropRateDistribution: dropRates,
      };

      results.push(point);

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

  let projections: YearProjection[] | undefined;
  if (config.enableMultiYearProjection && best) {
    projections = calculateMultiYearProjection(
      params,
      best.N,
      best.p,
      config.projectionYears || 5,
      config.discountRate || 0.08,
      seed,
    );
  }

  let sensitivity: SensitivityResult[] | undefined;
  if (config.enableSensitivityAnalysis && best) {
    sensitivity = calculateSensitivity(
      params,
      best.N,
      best.p,
      config,
      config.sensitivityRange || 0.2,
    );
  }

  return { results, best, projections, sensitivity };
}

function calculateMultiYearProjection(
  baseParams: StationParams,
  N: number,
  p: number,
  years: number,
  discountRate: number,
  seed: number,
): YearProjection[] {
  const projections: YearProjection[] = [];
  const mcRuns = 100; // Fewer runs for projections

  for (let year = 0; year < years; year++) {
    const yearSeed = hashSeed(seed, year, 0);
    let totalProfit = 0;
    let totalInvestment = 0;

    for (let r = 0; r < mcRuns; r++) {
      const rng = new RNG((yearSeed + r * 1013904223) >>> 0);
      const kpi = simulateYear(baseParams, N, p, rng, year);
      totalProfit += kpi.profit;
      totalInvestment += kpi.fixedCost;
    }

    const meanProfit = totalProfit / mcRuns;
    const meanInvestment = totalInvestment / mcRuns;

    projections.push({
      year: year + 1,
      mean: kpiZero(), // Simplified - would need actual mean KPIs
      cumulativeProfit:
        (projections[year - 1]?.cumulativeProfit || 0) + meanProfit,
      cumulativeInvestment:
        (projections[year - 1]?.cumulativeInvestment || 0) + meanInvestment,
      netPresentValue: 0, // Calculated below
    });
  }

  // Calculate NPV
  for (let i = 0; i < projections.length; i++) {
    const futureValue = projections[i].cumulativeProfit;
    projections[i].netPresentValue =
      futureValue / Math.pow(1 + discountRate, projections[i].year);
  }

  return projections;
}

function calculateSensitivity(
  baseParams: StationParams,
  N: number,
  p: number,
  config: GridSearchConfig,
  variation: number,
): SensitivityResult[] {
  const parameters = config.sensitivityParameters || [
    "priceElasticity",
    "baseArrivalsPerHourByMonth",
    "gridCostPerKwh",
    "fixedCostPerStallPerYear",
  ];

  const results: SensitivityResult[] = [];
  const mcRuns = 50;

  // Get base profit
  let baseProfit = 0;
  for (let r = 0; r < mcRuns; r++) {
    const rng = new RNG((config.seed + r * 1013904223) >>> 0);
    const kpi = simulateYear(baseParams, N, p, rng);
    baseProfit += kpi.profit;
  }
  baseProfit /= mcRuns;

  for (const param of parameters) {
    const testParams = { ...baseParams };
    let baseValue = 0;

    // Apply variation
    if (param === "priceElasticity") {
      baseValue = testParams.priceElasticity;
      testParams.priceElasticity *= 1 + variation;
    } else if (param === "gridCostPerKwh") {
      baseValue = testParams.gridCostPerKwh;
      testParams.gridCostPerKwh *= 1 + variation;
    } else if (param === "fixedCostPerStallPerYear") {
      baseValue = testParams.fixedCostPerStallPerYear;
      testParams.fixedCostPerStallPerYear *= 1 + variation;
    } else if (param === "baseArrivalsPerHourByMonth") {
      baseValue = testParams.baseArrivalsPerHourByMonth[0];
      testParams.baseArrivalsPerHourByMonth =
        testParams.baseArrivalsPerHourByMonth.map((v) => v * (1 + variation));
    }

    // Run simulation with varied parameter
    let variedProfit = 0;
    for (let r = 0; r < mcRuns; r++) {
      const rng = new RNG((config.seed + r * 1013904223) >>> 0);
      const kpi = simulateYear(testParams, N, p, rng);
      variedProfit += kpi.profit;
    }
    variedProfit /= mcRuns;

    results.push({
      parameter: param,
      baseValue,
      variation,
      profitChange: variedProfit - baseProfit,
      rank: 0, // Set later
    });
  }

  // Sort by absolute impact and assign ranks
  results.sort((a, b) => Math.abs(b.profitChange) - Math.abs(a.profitChange));
  results.forEach((r, i) => (r.rank = i + 1));

  return results;
}

function hashSeed(seed: number, N: number, p: number): number {
  const pm = Math.round(p * 1000);
  let x = (seed ^ (N * 374761393) ^ (pm * 668265263)) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x = (x ^ (x >>> 16)) >>> 0;
  return x;
}
