import { RNG, mean, percentile } from "./rng";
import {
  type StationParams,
  type SimRunKPIs,
  type MonthIndex,
  type HourOfDay,
  type VehicleClass,
} from "./types";
import {
  arrivalsRatePerHour,
  sampleVehicleClass,
  sampleEnergyKwh,
  sampleWaitToleranceMin,
  serviceTimeHoursFromEnergy,
  getDynamicPrice,
  getElectricityCost,
  calculateSolarGeneration,
  initializeBattery,
  manageBattery,
  initializeChargers,
  updateChargerReliability,
  calculateDemandCharge,
  type BatteryState,
  type ChargerState,
} from "./model";

type Stall = {
  busyUntilHour: number;
  chargerIndex: number;
};

type QueuedCar = {
  arrivalHour: number;
  waitTolMin: number;
  energyKwh: number;
  vehicleClass: VehicleClass;
  pricePerKwh: number; // Price at time of arrival
};

export function simulateYear(
  params: StationParams,
  N: number,
  basePrice: number,
  rng: RNG,
  yearOffset: number = 0,
): SimRunKPIs {
  const HOURS_PER_DAY = params.openHours;
  const DAYS_PER_YEAR = 365;
  const totalHours = DAYS_PER_YEAR * HOURS_PER_DAY;

  // Initialize chargers with reliability tracking
  const chargers: ChargerState[] = initializeChargers(N);
  let operationalChargers = N;

  // Stalls map to chargers
  const stalls: Stall[] = Array.from({ length: N }, (_, i) => ({
    busyUntilHour: 0,
    chargerIndex: i,
  }));

  // Queue
  const queue: QueuedCar[] = [];

  // Battery state
  let battery: BatteryState = initializeBattery(params);

  // Stats accumulators
  let revenue = 0;
  let energySoldKwh = 0;
  let arrivals = 0;
  let served = 0;
  let droppedQueueFull = 0;
  let droppedWaitTol = 0;
  let totalBusyHours = 0;
  let solarGenerationTotal = 0;
  let solarSelfConsumption = 0;
  let peakDemandKw = 0;
  let totalDowntimeHours = 0;
  let totalPriceSum = 0;
  let priceCount = 0;

  // Grid energy cost tracking
  let totalGridCost = 0;
  const hourlyDemandKw: number[] = new Array(totalHours).fill(0);

  // By vehicle class tracking
  const servedByClass: Record<string, number> = {};
  const revenueByClass: Record<string, number> = {};
  for (const vc of params.vehicleClasses) {
    servedByClass[vc.id] = 0;
    revenueByClass[vc.id] = 0;
  }

  const waitTimesMin: number[] = [];
  const monthByDay = buildMonthByDay();

  // Demand growth factor for multi-year projections
  const demandMultiplier = Math.pow(
    1 + (params.annualDemandGrowth || 0),
    yearOffset,
  );

  const onServe = (
    busyHours: number,
    eKwh: number,
    price: number,
    vehicleClass: VehicleClass,
  ) => {
    totalBusyHours += busyHours;
    energySoldKwh += eKwh;
    const sessionRevenue = eKwh * price;
    revenue += sessionRevenue;
    served++;

    servedByClass[vehicleClass.id] = (servedByClass[vehicleClass.id] || 0) + 1;
    revenueByClass[vehicleClass.id] =
      (revenueByClass[vehicleClass.id] || 0) + sessionRevenue;

    totalPriceSum += price;
    priceCount++;
  };

  for (let day = 0; day < DAYS_PER_YEAR; day++) {
    const month = monthByDay[day] as MonthIndex;

    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const hourStart = day * HOURS_PER_DAY + h;
      const hourEnd = hourStart + 1;
      const hourOfDay = h as HourOfDay;

      // Calculate current utilization for dynamic pricing
      const busyStalls = stalls.filter(
        (s) => s.busyUntilHour > hourStart,
      ).length;
      const currentUtilization = operationalChargers > 0 ? busyStalls / operationalChargers : 0;

      // Get current dynamic price
      const currentPrice = getDynamicPrice(
        basePrice,
        hourOfDay,
        currentUtilization,
        params,
      );

      // Update charger reliability
      operationalChargers = updateChargerReliability(
        chargers,
        hourStart,
        rng,
        params,
      );
      totalDowntimeHours += N - operationalChargers;

      // Calculate solar generation for this hour
      const solarGen = calculateSolarGeneration(
        month,
        hourOfDay,
        yearOffset,
        params,
      );
      solarGenerationTotal += solarGen;

      // Generate arrivals with demand growth
      const lambda =
        arrivalsRatePerHour(
          month,
          hourOfDay,
          basePrice,
          currentUtilization,
          params,
        ) * demandMultiplier;
      const kArrivals = rng.poisson(lambda);
      const arrivalTimes: number[] = Array.from(
        { length: kArrivals },
        () => hourStart + rng.uniform(),
      ).sort((a, b) => a - b);

      // Track energy demand for this hour (for demand charges)
      let hourEnergyDemand = 0;

      for (const tArrival of arrivalTimes) {
        droppedWaitTol += processQueueUntil(
          queue,
          stalls,
          chargers,
          tArrival,
          params,
          waitTimesMin,
          onServe,
        );

        arrivals++;

        const vehicleClass = sampleVehicleClass(rng, params);
        const energyKwh = sampleEnergyKwh(rng, vehicleClass, month);
        const waitTolMin = sampleWaitToleranceMin(rng, params);

        const freeIdx = findFreeStallIndex(stalls, chargers, tArrival);
        if (freeIdx !== -1) {
          const serviceH = serviceTimeHoursFromEnergy(energyKwh, params);
          stalls[freeIdx].busyUntilHour = tArrival + serviceH;
          onServe(serviceH, energyKwh, currentPrice, vehicleClass);
          waitTimesMin.push(0);
          hourEnergyDemand += energyKwh;
        } else {
          if (queue.length < params.qMax) {
            queue.push({
              arrivalHour: tArrival,
              waitTolMin,
              energyKwh,
              vehicleClass,
              pricePerKwh: currentPrice,
            });
          } else {
            droppedQueueFull++;
          }
        }
      }

      // Process queue through end of hour
      droppedWaitTol += processQueueUntil(
        queue,
        stalls,
        chargers,
        hourEnd,
        params,
        waitTimesMin,
        onServe,
      );

      // Calculate grid load for this hour
      const gridLoad = hourEnergyDemand;

      // Manage battery and get final grid consumption
      const batteryResult = manageBattery(
        battery,
        solarGen,
        gridLoad,
        hourOfDay,
        params,
      );
      battery = batteryResult.updatedBattery;

      // Track solar self-consumption
      solarSelfConsumption += Math.min(solarGen, gridLoad + batteryResult.toBattery);

      // Calculate actual grid consumption and cost
      const fromGrid = batteryResult.fromGrid;
      const gridCostPerKwh = getElectricityCost(hourOfDay, params);
      totalGridCost += fromGrid * gridCostPerKwh;

      // Track peak demand (kW)
      const hourDemandKw = fromGrid; // Simplified: assume uniform over hour
      hourlyDemandKw[hourStart] = hourDemandKw;
      if (hourDemandKw > peakDemandKw) {
        peakDemandKw = hourDemandKw;
      }
    }
  }

  // Calculate demand charge (monthly peak, simplified to annual)
  const monthlyPeakKw = peakDemandKw; // Simplified
  const demandChargeCost = calculateDemandCharge(monthlyPeakKw, params) * 12;

  const fixedCost =
    params.fixedCostPerYear + params.fixedCostPerStallPerYear * N;

  // Add battery replacement cost if applicable
  let batteryReplacementCost = 0;
  if (params.batteryConfig && battery.cyclesUsed > 0) {
    const maxCycles = params.batteryConfig.maxCyclesPerYear;
    const yearsUsed = battery.cyclesUsed / maxCycles;
    if (yearsUsed >= params.batteryConfig.lifespanYears) {
      batteryReplacementCost = params.batteryConfig.replacementCost;
    }
  }

  const totalCosts = totalGridCost + fixedCost + demandChargeCost + batteryReplacementCost;
  const profit = revenue - totalCosts;

  const avgWaitMin = waitTimesMin.length > 0 ? mean(waitTimesMin) : 0;
  const p95WaitMin =
    waitTimesMin.length > 0 ? percentile(waitTimesMin, 0.95) : 0;
  const utilization =
    N > 0 ? clamp01(totalBusyHours / (N * totalHours)) : 0;

  return {
    revenue,
    energySoldKwh,
    energyCost: totalGridCost,
    fixedCost,
    profit,

    arrivals,
    served,
    droppedQueueFull,
    droppedWaitTol,

    avgWaitMin,
    p95WaitMin,
    utilization,

    demandChargeCost,
    solarGenerationKwh: solarGenerationTotal,
    solarSelfConsumptionKwh: solarSelfConsumption,
    batteryCycles: battery.cyclesUsed,
    peakDemandKw,
    chargerDowntimeHours: totalDowntimeHours,
    averagePricePerKwh: priceCount > 0 ? totalPriceSum / priceCount : basePrice,

    servedByClass,
    revenueByClass,
  };
}

function processQueueUntil(
  queue: QueuedCar[],
  stalls: Stall[],
  chargers: ChargerState[],
  targetHour: number,
  params: StationParams,
  waitTimesMin: number[],
  onServe: (
    busyHours: number,
    energyKwh: number,
    price: number,
    vehicleClass: VehicleClass,
  ) => void,
): number {
  let droppedWaitTol = 0;

  while (queue.length > 0) {
    const nextFreeHour = findEarliestStallFreeHour(stalls, chargers);
    if (nextFreeHour > targetHour) break;

    droppedWaitTol += dropExpiredFromQueue(queue, nextFreeHour);
    if (queue.length === 0) continue;

    droppedWaitTol += assignFromQueueToFreeStalls(
      queue,
      stalls,
      chargers,
      nextFreeHour,
      params,
      waitTimesMin,
      onServe,
    );
  }

  droppedWaitTol += dropExpiredFromQueue(queue, targetHour);
  return droppedWaitTol;
}

function assignFromQueueToFreeStalls(
  queue: QueuedCar[],
  stalls: Stall[],
  chargers: ChargerState[],
  tHour: number,
  params: StationParams,
  waitTimesMin: number[],
  onServe: (
    busyHours: number,
    energyKwh: number,
    price: number,
    vehicleClass: VehicleClass,
  ) => void,
): number {
  let droppedWaitTol = 0;

  while (queue.length > 0) {
    const freeIdx = findFreeStallIndex(stalls, chargers, tHour);
    if (freeIdx === -1) break;

    const car = queue.shift()!;
    const waitedMin = (tHour - car.arrivalHour) * 60;

    if (waitedMin > car.waitTolMin) {
      droppedWaitTol++;
      continue;
    }

    const serviceH = serviceTimeHoursFromEnergy(car.energyKwh, params);
    stalls[freeIdx].busyUntilHour = tHour + serviceH;
    waitTimesMin.push(waitedMin);
    onServe(serviceH, car.energyKwh, car.pricePerKwh, car.vehicleClass);
  }

  return droppedWaitTol;
}

function dropExpiredFromQueue(queue: QueuedCar[], tHour: number): number {
  let dropped = 0;

  for (let i = queue.length - 1; i >= 0; i--) {
    const waitedMin = (tHour - queue[i].arrivalHour) * 60;
    if (waitedMin > queue[i].waitTolMin) {
      queue.splice(i, 1);
      dropped++;
    }
  }

  return dropped;
}

function findFreeStallIndex(
  stalls: Stall[],
  chargers: ChargerState[],
  tHour: number,
): number {
  for (let i = 0; i < stalls.length; i++) {
    if (
      stalls[i].busyUntilHour <= tHour &&
      chargers[stalls[i].chargerIndex]?.isOperational
    ) {
      return i;
    }
  }
  return -1;
}

function findEarliestStallFreeHour(
  stalls: Stall[],
  chargers: ChargerState[],
): number {
  let minHour = Infinity;
  for (const stall of stalls) {
    if (
      stall.busyUntilHour < minHour &&
      chargers[stall.chargerIndex]?.isOperational
    ) {
      minHour = stall.busyUntilHour;
    }
  }
  return minHour;
}

function buildMonthByDay(): number[] {
  const monthLens = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const out: number[] = [];
  let m = 0;
  let dInM = 0;
  for (let day = 0; day < 365; day++) {
    out.push(m);
    dInM++;
    if (dInM >= monthLens[m]) {
      m++;
      dInM = 0;
    }
  }
  return out;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
