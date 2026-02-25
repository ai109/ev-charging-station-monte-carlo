// src/sim/model.ts

import { type StationParams, type MonthIndex } from "./types";
import { RNG, clamp } from "./rng";

export function demandFactorFromPrice(
  p: number,
  params: StationParams,
): number {
  // Linear model around pRef:
  // f = 1 - alpha*(p - pRef), clamped.
  const raw = 1 - params.priceSensitivity * (p - params.pRef);
  return clamp(raw, params.minDemandFactor, params.maxDemandFactor);
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
  const base = params.baseArrivalsPerHourByMonth[month] ?? 0;
  const fPrice = demandFactorFromPrice(p, params);
  const fTemp = demandFactorFromTemp(month, params);
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

export function priceSkipProbability(p: number, params: StationParams): number {
  // Optional extra: even before queue, some customers skip due to price.
  // We keep it simple and consistent with fPrice:
  // If demandFactor already models price, this can be small. We'll set a mild curve:
  // P(skip) grows when p > pRef.
  const delta = p - params.pRef;
  const k = 6.0; // steepness
  const x = k * delta; // assumes prices are in ~0.4..0.9
  const sigmoid = 1 / (1 + Math.exp(-x));
  // baseline 2% + up to 20%
  return clamp(0.02 + 0.2 * sigmoid, 0.0, 0.35);
}
