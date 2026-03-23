import {
  type StationParams,
  type MonthIndex,
  type HourOfDay,
  type VehicleClass,
} from "./types";
import { RNG, clamp } from "./rng";

// ============================================================================
// Dynamic Pricing
// ============================================================================

export function getDynamicPrice(
  basePrice: number,
  hour: HourOfDay,
  currentUtilization: number,
  params: StationParams,
): number {
  if (!params.dynamicPricing?.enabled) {
    return basePrice;
  }

  const config = params.dynamicPricing;
  let multiplier = 1.0;

  // Peak hour surcharge
  if (config.peakHours.includes(hour)) {
    multiplier += 0.2; // 20% peak premium
  }

  // Utilization-based surge pricing
  if (currentUtilization >= config.thresholdUtilization) {
    const excessUtilization =
      (currentUtilization - config.thresholdUtilization) /
      (1 - config.thresholdUtilization);
    const surgeAmount =
      excessUtilization * (config.surgeMultiplier - 1) * 0.5;
    multiplier += Math.min(surgeAmount, config.surgeMultiplier - 1);
  }

  return basePrice * multiplier;
}

// ============================================================================
// Time-of-Use Electricity Costs
// ============================================================================

export function getElectricityCost(hour: HourOfDay, params: StationParams): number {
  if (!params.touSchedule || params.touSchedule.length === 0) {
    return params.gridCostPerKwh;
  }

  for (const period of params.touSchedule) {
    if (hour >= period.hourStart && hour < period.hourEnd) {
      return period.costPerKwh;
    }
  }

  return params.gridCostPerKwh; // Fallback
}

// ============================================================================
// Vehicle Class Sampling
// ============================================================================

export function sampleVehicleClass(
  rng: RNG,
  params: StationParams,
): VehicleClass {
  const classes = params.vehicleClasses;
  if (classes.length === 0) {
    throw new Error("No vehicle classes configured");
  }
  if (classes.length === 1) {
    return classes[0];
  }

  const r = rng.uniform();
  let cumulative = 0;
  for (const vc of classes) {
    cumulative += vc.proportion;
    if (r <= cumulative) {
      return vc;
    }
  }

  return classes[classes.length - 1];
}

// ============================================================================
// Energy Sampling by Vehicle Class
// ============================================================================

export function sampleEnergyKwh(
  rng: RNG,
  vehicleClass: VehicleClass,
  month: MonthIndex,
): number {
  const winterBoost = month === 11 || month === 0 || month === 1 ? 1.08 : 1.0;
  const x = rng.normal(
    vehicleClass.energyKwhMean * winterBoost,
    vehicleClass.energyKwhStd,
  );
  return clamp(x, vehicleClass.energyKwhMin, vehicleClass.energyKwhMax);
}

// ============================================================================
// Demand Factor Models
// ============================================================================

export function demandFactorFromPrice(
  p: number,
  vehicleClass: VehicleClass,
  params: StationParams,
): number {
  // Constant-elasticity demand model with vehicle-specific sensitivity
  const elasticity = params.priceElasticity * vehicleClass.priceSensitivityMultiplier;
  return Math.pow(p / params.pRef, -elasticity);
}

export function demandFactorFromTemp(
  month: MonthIndex,
  params: StationParams,
): number {
  const temp = params.avgTempCByMonth[month];
  const raw = 1 + params.tempSensitivity * (params.refTempC - temp);
  return clamp(raw, 0.5, 1.8);
}

export function arrivalsRatePerHour(
  month: MonthIndex,
  hour: HourOfDay,
  basePrice: number,
  currentUtilization: number,
  params: StationParams,
): number {
  const base = params.baseArrivalsPerHourByMonth[month];
  const fTemp = demandFactorFromTemp(month, params);
  
  // Split arrivals among vehicle classes based on their proportions and price sensitivity
  let totalRate = 0;
  for (const vc of params.vehicleClasses) {
    const dynamicPrice = getDynamicPrice(basePrice, hour, currentUtilization, params);
    const fPrice = demandFactorFromPrice(dynamicPrice, vc, params);
    totalRate += base * vc.proportion * fPrice * fTemp;
  }
  
  return totalRate;
}

// ============================================================================
// Waiting Tolerance
// ============================================================================

export function sampleWaitToleranceMin(rng: RNG, params: StationParams): number {
  const x = rng.normal(params.waitTolMeanMin, params.waitTolStdMin);
  return clamp(x, params.waitTolMin, params.waitTolMax);
}

// ============================================================================
// Service Time
// ============================================================================

export function serviceTimeHoursFromEnergy(
  energyKwh: number,
  params: StationParams,
): number {
  return energyKwh / Math.max(1e-6, params.powerKw);
}

// ============================================================================
// Solar Generation Model
// ============================================================================

// Solar irradiance by month (kWh/m²/day) - approximate for central Europe
const IRRADIANCE_BY_MONTH = [1.5, 2.2, 3.3, 4.5, 5.5, 6.0, 6.2, 5.5, 4.2, 2.8, 1.6, 1.2];

// Hourly solar pattern (normalized to daily total)
const HOURLY_SOLAR_PATTERN = [
  0, 0, 0, 0, 0, 0.02, 0.06, 0.1, 0.12, 0.12, 0.11, 0.1,
  0.09, 0.08, 0.07, 0.06, 0.04, 0.02, 0.01, 0, 0, 0, 0, 0,
];

export function calculateSolarGeneration(
  month: MonthIndex,
  hour: HourOfDay,
  yearOffset: number,
  params: StationParams,
): number {
  if (!params.solarConfig) {
    return 0;
  }

  const config = params.solarConfig;
  const dailyIrradiance = IRRADIANCE_BY_MONTH[month];
  const hourlyFactor = HOURLY_SOLAR_PATTERN[hour];
  
  // Account for panel degradation over years
  const degradationFactor = Math.pow(
    1 - config.degradationPerYear,
    yearOffset,
  );

  // Simple model: capacity * efficiency * irradiance * hourly pattern * degradation
  const generation =
    config.capacityKw *
    config.efficiency *
    dailyIrradiance *
    hourlyFactor *
    degradationFactor;

  return Math.max(0, generation);
}

// ============================================================================
// Battery Management
// ============================================================================

export interface BatteryState {
  soc: number; // State of charge (0-1)
  cyclesUsed: number;
  totalChargedKwh: number;
  totalDischargedKwh: number;
}

export function initializeBattery(params: StationParams): BatteryState {
  if (!params.batteryConfig) {
    return { soc: 0, cyclesUsed: 0, totalChargedKwh: 0, totalDischargedKwh: 0 };
  }
  return {
    soc: params.batteryConfig.initialSoc,
    cyclesUsed: 0,
    totalChargedKwh: 0,
    totalDischargedKwh: 0,
  };
}

export function manageBattery(
  battery: BatteryState,
  solarGeneration: number,
  gridLoad: number, // Positive = need power, negative = excess solar
  _hour: number, // Reserved for time-based battery strategies
  params: StationParams,
): { fromGrid: number; fromBattery: number; toBattery: number; updatedBattery: BatteryState } {
  if (!params.batteryConfig) {
    return {
      fromGrid: Math.max(0, gridLoad - solarGeneration),
      fromBattery: 0,
      toBattery: 0,
      updatedBattery: battery,
    };
  }

  const config = params.batteryConfig;
  const capacityKwh = config.capacityKwh;
  const currentSoc = battery.soc;
  const currentEnergy = currentSoc * capacityKwh;

  let fromGrid = 0;
  let fromBattery = 0;
  let toBattery = 0;

  // Available solar after meeting immediate load
  const netSolar = solarGeneration - Math.max(0, gridLoad);

  if (netSolar > 0 && currentSoc < config.maxSoc) {
    // Charge battery with excess solar
    const maxCharge = Math.min(
      netSolar,
      config.maxChargeKw,
      (config.maxSoc - currentSoc) * capacityKwh / config.chargeEfficiency,
    );
    toBattery = maxCharge * config.chargeEfficiency;
    battery.totalChargedKwh += toBattery;
  } else if (gridLoad > solarGeneration && currentSoc > config.minSoc) {
    // Discharge battery to meet load
    const energyNeeded = gridLoad - solarGeneration;
    const maxDischarge = Math.min(
      energyNeeded,
      config.maxDischargeKw,
      (currentSoc - config.minSoc) * capacityKwh * config.dischargeEfficiency,
    );
    fromBattery = maxDischarge;
    battery.totalDischargedKwh += maxDischarge / config.dischargeEfficiency;
  }

  // Update SOC
  const newEnergy = currentEnergy + toBattery - battery.totalDischargedKwh;
  battery.soc = clamp(newEnergy / capacityKwh, config.minSoc, config.maxSoc);

  // Track cycles (simplified: 1 cycle = full capacity discharged)
  const cycleContribution = battery.totalDischargedKwh / capacityKwh;
  if (cycleContribution >= 1) {
    battery.cyclesUsed += Math.floor(cycleContribution);
    battery.totalDischargedKwh = 0;
  }

  // Calculate grid consumption
  fromGrid = Math.max(0, gridLoad - solarGeneration - fromBattery);

  return { fromGrid, fromBattery, toBattery, updatedBattery: battery };
}

// ============================================================================
// Equipment Reliability
// ============================================================================

export interface ChargerState {
  isOperational: boolean;
  failureTime: number; // Hour when failure occurred
  repairTime: number; // Hours needed for repair
}

export function initializeChargers(N: number): ChargerState[] {
  return Array.from({ length: N }, () => ({
    isOperational: true,
    failureTime: Infinity,
    repairTime: 0,
  }));
}

export function updateChargerReliability(
  chargers: ChargerState[],
  currentHour: number,
  rng: RNG,
  params: StationParams,
): number {
  if (!params.reliability) {
    return chargers.filter((c) => c.isOperational).length;
  }

  const config = params.reliability;
  let operationalCount = 0;

  for (const charger of chargers) {
    if (charger.isOperational) {
      // Check for new failure
      const failureProbability = 1 / config.meanTimeBetweenFailuresHours;
      if (rng.uniform() < failureProbability) {
        charger.isOperational = false;
        charger.failureTime = currentHour;
        charger.repairTime = rng.exponential(config.meanRepairTimeHours);
      } else {
        operationalCount++;
      }
    } else {
      // Check if repair is complete
      const hoursSinceFailure = currentHour - charger.failureTime;
      if (hoursSinceFailure >= charger.repairTime) {
        charger.isOperational = true;
        charger.failureTime = Infinity;
        charger.repairTime = 0;
        operationalCount++;
      }
    }
  }

  return operationalCount;
}

// ============================================================================
// Demand Charges
// ============================================================================

export function calculateDemandCharge(
  peakDemandKw: number,
  params: StationParams,
): number {
  if (!params.demandCharge?.enabled) {
    return 0;
  }

  const config = params.demandCharge;
  const billedDemand = peakDemandKw * config.billingDemandPercent;
  return billedDemand * config.ratePerKw;
}
