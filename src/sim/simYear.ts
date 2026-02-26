import { RNG, mean, percentile } from "./rng";
import { type StationParams, type SimRunKPIs, type MonthIndex } from "./types";
import {
  arrivalsRatePerHour,
  sampleEnergyKwh,
  sampleWaitToleranceMin,
  serviceTimeHoursFromEnergy,
} from "./model";

type Stall = {
  busyUntilHour: number; // absolute hour in year when stall becomes free
};

type QueuedCar = {
  arrivalHour: number;
  waitTolMin: number;
  energyKwh: number;
};

export function simulateYear(
  params: StationParams,
  N: number,
  p: number,
  rng: RNG,
): SimRunKPIs {
  const HOURS_PER_DAY = params.openHours;
  const DAYS_PER_YEAR = 365;

  const totalHours = DAYS_PER_YEAR * HOURS_PER_DAY;

  // Stalls
  const stalls: Stall[] = Array.from({ length: N }, () => ({
    busyUntilHour: 0,
  }));

  // Queue holds arrival time in operating-hour coordinates and wait tolerance.
  const queue: QueuedCar[] = [];

  // Stats accumulators
  let revenue = 0;
  let energySoldKwh = 0;
  let arrivals = 0;
  let served = 0;
  let droppedQueueFull = 0;
  let droppedWaitTol = 0;

  const waitTimesMin: number[] = [];

  // For utilization: sum busy time across stalls / (N * totalHours)
  let totalBusyHours = 0;

  const monthByDay = buildMonthByDay();

  const onServe = (busyHours: number, eKwh: number) => {
    totalBusyHours += busyHours;
    energySoldKwh += eKwh;
    revenue += eKwh * p;
    served++;
  };

  // For each operating hour: sample arrivals, then process queue in continuous time.
  for (let day = 0; day < DAYS_PER_YEAR; day++) {
    const month = monthByDay[day] as MonthIndex;

    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const hourStart = day * HOURS_PER_DAY + h;
      const hourEnd = hourStart + 1;

      // Generate Poisson arrivals in this hour and place each at a random
      // intra-hour timestamp to avoid one-session-per-hour artifacts.
      const lambda = arrivalsRatePerHour(month, p, params);
      const kArrivals = rng.poisson(lambda);
      const arrivalTimes: number[] = Array.from(
        { length: kArrivals },
        () => hourStart + rng.uniform(),
      ).sort((a, b) => a - b);

      for (const tArrival of arrivalTimes) {
        droppedWaitTol += processQueueUntil(
          queue,
          stalls,
          tArrival,
          params,
          waitTimesMin,
          onServe,
        );

        arrivals++;

        const energyKwh = sampleEnergyKwh(rng, params, month);
        const waitTolMin = sampleWaitToleranceMin(rng, params);

        // Try to start service immediately if any stall is free
        const freeIdx = findFreeStallIndex(stalls, tArrival);
        if (freeIdx !== -1) {
          const serviceH = serviceTimeHoursFromEnergy(energyKwh, params);
          stalls[freeIdx].busyUntilHour = tArrival + serviceH;
          onServe(serviceH, energyKwh);

          waitTimesMin.push(0);
        } else {
          // No free stall -> join queue if space
          if (queue.length < params.qMax) {
            queue.push({ arrivalHour: tArrival, waitTolMin, energyKwh });
          } else {
            droppedQueueFull++;
          }
        }
      }

      // Process queue through end of hour so cars can start when stalls free
      // even if no arrival happens at that exact moment.
      droppedWaitTol += processQueueUntil(
        queue,
        stalls,
        hourEnd,
        params,
        waitTimesMin,
        onServe,
      );
    }
  }

  const energyCost = energySoldKwh * params.gridCostPerKwh;
  const fixedCost =
    params.fixedCostPerYear + params.fixedCostPerStallPerYear * N;
  const profit = revenue - energyCost - fixedCost;

  const avgWaitMin = mean(waitTimesMin);
  const p95WaitMin = percentile(waitTimesMin, 0.95);
  const utilization = N > 0 ? clamp01(totalBusyHours / (N * totalHours)) : 0;

  return {
    revenue,
    energySoldKwh,
    energyCost,
    fixedCost,
    profit,

    arrivals,
    served,
    droppedQueueFull,
    droppedWaitTol,

    avgWaitMin,
    p95WaitMin,
    utilization,
  };
}

function processQueueUntil(
  queue: QueuedCar[],
  stalls: Stall[],
  targetHour: number,
  params: StationParams,
  waitTimesMin: number[],
  onServe: (busyHours: number, energyKwh: number) => void,
): number {
  let droppedWaitTol = 0;

  while (queue.length > 0) {
    const nextFreeHour = findEarliestStallFreeHour(stalls);
    if (nextFreeHour > targetHour) break;

    droppedWaitTol += dropExpiredFromQueue(queue, nextFreeHour);
    if (queue.length === 0) continue;

    droppedWaitTol += assignFromQueueToFreeStalls(
      queue,
      stalls,
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
  tHour: number,
  params: StationParams,
  waitTimesMin: number[],
  onServe: (busyHours: number, energyKwh: number) => void,
): number {
  let droppedWaitTol = 0;

  while (queue.length > 0) {
    const freeIdx = findFreeStallIndex(stalls, tHour);
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
    onServe(serviceH, car.energyKwh);
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
  stalls: { busyUntilHour: number }[],
  tHour: number,
): number {
  for (let i = 0; i < stalls.length; i++) {
    if (stalls[i].busyUntilHour <= tHour) return i;
  }
  return -1;
}

function findEarliestStallFreeHour(stalls: Stall[]): number {
  let minHour = Infinity;
  for (const stall of stalls) {
    if (stall.busyUntilHour < minHour) minHour = stall.busyUntilHour;
  }
  return minHour;
}

function buildMonthByDay(): number[] {
  // Non-leap year month lengths
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
