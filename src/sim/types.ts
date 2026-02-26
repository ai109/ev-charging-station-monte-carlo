export type MonthIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;

export interface PriceGrid {
  pMin: number; // €/kWh
  pMax: number; // €/kWh
  pStep: number; // €/kWh
}

export interface NGrid {
  nMin: number;
  nMax: number;
}

export interface StationParams {
  // Station / service
  powerKw: number; // charging power per stall (kW)
  qMax: number; // max queue length (cars waiting)
  openHours: number; // hours per day station is "active" (e.g. 16 or 24)

  // Economics
  gridCostPerKwh: number; // €/kWh paid to utility
  fixedCostPerStallPerYear: number; // €/year per stall (CAPEX amortization + maintenance)
  fixedCostPerYear: number; // €/year (rent, admin etc.)

  // Demand / behavior
  baseArrivalsPerHourByMonth: number[]; // length 12, baseline arrivals/h (seasonality)
  avgTempCByMonth: number[]; // length 12
  tempSensitivity: number; // how much demand changes per °C vs refTemp
  refTempC: number; // reference temperature

  // Price-demand model
  pRef: number; // reference price
  priceElasticity: number; // constant elasticity epsilon in lambda(p)=lambda0*(p/pRef)^(-epsilon)

  // Energy demand distribution (kWh per session)
  energyKwhMean: number;
  energyKwhStd: number;
  energyKwhMin: number;
  energyKwhMax: number;

  // Waiting tolerance (minutes)
  waitTolMeanMin: number;
  waitTolStdMin: number;
  waitTolMin: number;
  waitTolMax: number;
}

export interface SimRunKPIs {
  revenue: number; // €
  energySoldKwh: number;
  energyCost: number; // €
  fixedCost: number; // €
  profit: number; // €

  arrivals: number;
  served: number;
  droppedQueueFull: number;
  droppedWaitTol: number;

  avgWaitMin: number; // mean wait among served
  p95WaitMin: number; // 95th percentile wait among served
  utilization: number; // avg stall utilization [0..1]
}

export interface GridPointResult {
  N: number;
  p: number;

  // Monte Carlo aggregated
  mean: SimRunKPIs;
  stderrProfit: number; // standard error of profit
  stderrDropRate: number; // standard error of drop rate

  // helper stats
  dropRate: number; // total dropped / arrivals (mean)
}

export interface GridSearchConfig {
  nGrid: NGrid;
  pGrid: PriceGrid;
  mcRuns: number; // Monte Carlo repetitions per (N,p)
  seed: number;

  // constraint mode (optional)
  maxDropRate?: number; // e.g. 0.10
  maxP95WaitMin?: number; // e.g. 10
}

export interface WorkerProgress {
  stage: "running" | "done" | "error";
  message?: string;
  completed: number;
  total: number;
}

export interface WorkerRequest {
  type: "run-grid";
  params: StationParams;
  config: GridSearchConfig;
}

export interface WorkerResponse {
  type: "progress" | "result" | "error";
  progress?: WorkerProgress;
  results?: GridPointResult[];
  best?: GridPointResult | null;
  error?: string;
}
