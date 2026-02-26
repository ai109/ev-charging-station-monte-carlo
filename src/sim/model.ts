// src/sim/model.ts

import { type StationParams, type MonthIndex } from "./types";
import { RNG, clamp } from "./rng";

export function demandFactorFromPrice(
  p: number,
  params: StationParams,
): number {
  // Constant-elasticity demand model:
  // lambda(p) = lambda0 * (p / pRef)^(-epsilon)
  return Math.pow(p / params.pRef, -params.priceElasticity);
}

export function demandFactorFromTemp(
  month: MonthIndex,
  params: StationParams,
): number {
  // If temperature below ref -> increase demand (e.g., batteries less efficient).
  // factor = 1 + tempSensitivity*(refTemp - temp)
  const temp = params.avgTempCByMonth[month];
  const raw = 1 + params.tempSensitivity * (params.refTempC - temp);
  return clamp(raw, 0.5, 1.8);
}

export function arrivalsRatePerHour(
  month: MonthIndex,
  p: number,
  params: StationParams,
): number {
  const base = params.baseArrivalsPerHourByMonth[month];
  const fPrice = demandFactorFromPrice(p, params);
  const fTemp = demandFactorFromTemp(month, params);
  // Positivity is guaranteed by validated params: base > 0, p > 0, pRef > 0,
  // priceElasticity > 0, and positive temperature factor.
  return base * fPrice * fTemp;
}

export function sampleEnergyKwh(
  rng: RNG,
  params: StationParams,
  month: MonthIndex,
): number {
  // Simple: normal + clamp (you can later switch to lognormal if desired).
  // Optional seasonal bump: winter slightly higher kWh per session.
  const winterBoost = month === 11 || month === 0 || month === 1 ? 1.08 : 1.0;
  const x = rng.normal(params.energyKwhMean * winterBoost, params.energyKwhStd);
  return clamp(x, params.energyKwhMin, params.energyKwhMax);
}

export function sampleWaitToleranceMin(
  rng: RNG,
  params: StationParams,
): number {
  const x = rng.normal(params.waitTolMeanMin, params.waitTolStdMin);
  return clamp(x, params.waitTolMin, params.waitTolMax);
}

export function serviceTimeHoursFromEnergy(
  energyKwh: number,
  params: StationParams,
): number {
  // time = energy / power
  return energyKwh / Math.max(1e-6, params.powerKw);
}
