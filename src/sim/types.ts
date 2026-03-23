export type MonthIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11;
export type HourOfDay = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22 | 23;

export interface PriceGrid {
  pMin: number; // €/kWh
  pMax: number; // €/kWh
  pStep: number; // €/kWh
}

export interface NGrid {
  nMin: number;
  nMax: number;
}

// Vehicle class with specific characteristics
export interface VehicleClass {
  id: string;
  name: string;
  batteryCapacityKwh: number; // Typical battery size
  energyKwhMean: number; // Average energy requested per session
  energyKwhStd: number;
  energyKwhMin: number;
  energyKwhMax: number;
  proportion: number; // Probability this vehicle type arrives (0-1)
  priceSensitivityMultiplier: number; // 1.0 = average, >1.0 = more sensitive
}

// Time-of-use electricity pricing periods
export interface TOUPeriod {
  hourStart: number; // 0-23
  hourEnd: number; // 1-24
  costPerKwh: number; // €/kWh during this period
}

// Solar panel configuration
export interface SolarConfig {
  capacityKw: number; // Peak capacity
  efficiency: number; // Panel efficiency (0-1)
  tiltAngle: number; // Degrees from horizontal
  azimuthAngle: number; // Degrees from south (0=south, -90=east, 90=west)
  degradationPerYear: number; // Annual degradation rate (e.g., 0.005 = 0.5%)
}

// Battery storage configuration
export interface BatteryConfig {
  capacityKwh: number; // Total capacity
  chargeEfficiency: number; // Charging efficiency (0-1)
  dischargeEfficiency: number; // Discharging efficiency (0-1)
  maxChargeKw: number; // Max charging rate
  maxDischargeKw: number; // Max discharging rate
  initialSoc: number; // Initial state of charge (0-1)
  minSoc: number; // Minimum state of charge (0-1)
  maxSoc: number; // Maximum state of charge (0-1), typically 0.9-1.0
  maxCyclesPerYear: number; // Max charge/discharge cycles for warranty
  replacementCost: number; // Cost to replace battery after warranty
  lifespanYears: number;
}

// Equipment reliability parameters
export interface ReliabilityParams {
  meanTimeBetweenFailuresHours: number; // MTBF for chargers
  meanRepairTimeHours: number; // MTTR
  preventiveMaintenanceHoursPerYear: number;
}

// Demand charge configuration
export interface DemandChargeConfig {
  enabled: boolean;
  ratePerKw: number; // €/kW of peak monthly demand
  billingDemandPercent: number; // Percentage of peak to bill (e.g., 0.8 = 80%)
}

// Dynamic pricing configuration
export interface DynamicPricingConfig {
  enabled: boolean;
  basePrice: number; // Base price per kWh
  surgeMultiplier: number; // Max surge multiplier (e.g., 2.0 = double price)
  thresholdUtilization: number; // Utilization % that triggers surge pricing
  peakHours: HourOfDay[]; // Hours considered peak
}

export interface StationParams {
  powerKw: number; // charging power per stall (kW)
  qMax: number; // max queue length (cars waiting)
  openHours: number; // hours per day station is "active" (e.g. 16 or 24)

  // Economics
  gridCostPerKwh: number; // Base €/kWh paid to utility (fallback if TOU not configured)
  touSchedule: TOUPeriod[]; // Time-of-use pricing schedule
  fixedCostPerStallPerYear: number; // €/year per stall (CAPEX amortization + maintenance)
  fixedCostPerYear: number; // €/year (rent, admin etc.)
  demandCharge: DemandChargeConfig; // Peak demand charges

  // Demand / behavior
  baseArrivalsPerHourByMonth: number[]; // length 12, baseline arrivals/h (seasonality)
  avgTempCByMonth: number[]; // length 12
  tempSensitivity: number; // how much demand changes per °C vs refTemp
  refTempC: number; // reference temperature

  // Price-demand model
  pRef: number; // reference price
  priceElasticity: number; // constant elasticity epsilon in lambda(p)=lambda0*(p/pRef)^(-epsilon)

  // Vehicle classes (replaces single energy distribution)
  vehicleClasses: VehicleClass[];

  // Waiting tolerance (minutes)
  waitTolMeanMin: number;
  waitTolStdMin: number;
  waitTolMin: number;
  waitTolMax: number;

  // Renewable energy
  solarConfig?: SolarConfig;
  batteryConfig?: BatteryConfig;

  // Equipment reliability
  reliability?: ReliabilityParams;

  // Dynamic pricing
  dynamicPricing?: DynamicPricingConfig;

  // Multi-year simulation
  projectionYears?: number;
  annualDemandGrowth?: number; // Growth rate (e.g., 0.05 = 5%)
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

  // New metrics
  demandChargeCost: number; // € peak demand charges
  solarGenerationKwh: number; // kWh generated
  solarSelfConsumptionKwh: number; // kWh used from solar
  batteryCycles: number; // Number of battery cycles used
  peakDemandKw: number; // Max kW drawn from grid
  chargerDowntimeHours: number; // Total hours chargers were down
  averagePricePerKwh: number; // Actual average price charged

  // By vehicle class
  servedByClass: Record<string, number>;
  revenueByClass: Record<string, number>;
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

  // Confidence intervals (95%)
  profitCI: [number, number]; // [lower, upper]
  dropRateCI: [number, number];
  revenueCI: [number, number];

  // Risk metrics
  profitVaR95: number; // 5th percentile of profit (Value at Risk)
  profitCVaR95: number; // Conditional VaR (average of bottom 5%)
  worstCaseProfit: number; // Absolute minimum profit observed

  // Full distribution for histogram
  profitDistribution: number[];
  dropRateDistribution: number[];
}

// Sensitivity analysis result
export interface SensitivityResult {
  parameter: string;
  baseValue: number;
  variation: number; // +/- percentage
  profitChange: number; // How much profit changes
  rank: number; // Importance rank (1 = most sensitive)
}

// Multi-year projection result
export interface YearProjection {
  year: number;
  mean: SimRunKPIs;
  cumulativeProfit: number;
  cumulativeInvestment: number;
  netPresentValue: number;
}

// Saved scenario for comparison
export interface Scenario {
  id: string;
  name: string;
  timestamp: number;
  params: StationParams;
  config: GridSearchConfig;
  best: GridPointResult | null;
  results: GridPointResult[];
  projections?: YearProjection[];
  sensitivity?: SensitivityResult[];
}

export interface GridSearchConfig {
  nGrid: NGrid;
  pGrid: PriceGrid;
  mcRuns: number; // Monte Carlo repetitions per (N,p)
  seed: number;

  // constraint mode (optional)
  maxDropRate?: number; // e.g. 0.10
  maxP95WaitMin?: number; // e.g. 10

  // Analysis options
  enableSensitivityAnalysis?: boolean;
  sensitivityParameters?: string[]; // Which parameters to vary
  sensitivityRange?: number; // +/- percentage (e.g., 0.20 = 20%)

  enableMultiYearProjection?: boolean;
  projectionYears?: number;
  discountRate?: number; // For NPV calculation (e.g., 0.08 = 8%)
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
