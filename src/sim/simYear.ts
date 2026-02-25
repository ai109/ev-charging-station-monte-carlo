import { RNG, mean, percentile } from "./rng";
import { type StationParams, type SimRunKPIs, type MonthIndex } from "./types";
import {
  arrivalsRatePerHour,
  priceSkipProbability,
  sampleEnergyKwh,
  sampleWaitToleranceMin,
  serviceTimeHoursFromEnergy,
} from "./model";

type Stall = {
  busyUntilHour: number; // absolute hour in year when stall becomes free
};

export function simulateYear(
  params: StationParams,
  N: number,
  p: number,
  rng: RNG,
): SimRunKPIs {
  const HOURS_PER_DAY = params.openHours;
  const DAYS_PER_YEAR = 365;

  // We simulate "operating hours" only. Each day has HOURS_PER_DAY hours.
  const totalHours = DAYS_PER_YEAR * HOURS_PER_DAY;

  // Stalls
  const stalls: Stall[] = Array.from({ length: N }, () => ({
    busyUntilHour: 0,
  }));

  // Queue holds "ready time" (arrival hour) and personal wait tolerance
  type QueuedCar = {
    arrivalHour: number;
    waitTolMin: number;
    energyKwh: number;
  };
  const queue: QueuedCar[] = [];

  // Stats accumulators
  let revenue = 0;
  let energySoldKwh = 0;
  let arrivals = 0;
  let served = 0;
  let droppedQueueFull = 0;
  let droppedWaitTol = 0;
  let droppedPrice = 0;

  const waitTimesMin: number[] = [];

  // For utilization: sum busy time across stalls / (N * totalHours)
  let totalBusyHours = 0;

  // Helper: month index by day-of-year (simple mapping using typical month lengths)
  const monthByDay = buildMonthByDay();

  // For each day, per hour: generate arrivals (Poisson), process queue and finishing
  for (let day = 0; day < DAYS_PER_YEAR; day++) {
    const month = monthByDay[day] as MonthIndex;

    for (let h = 0; h < HOURS_PER_DAY; h++) {
      const tHour = day * HOURS_PER_DAY + h; // absolute hour in year (operating hours)

      // 1) Some queued cars may have exceeded wait tolerance -> drop
      // We treat "expected wait" as current time - arrival time (already waited).
      // If they've waited beyond tolerance, they leave.
      while (queue.length > 0) {
        const q0 = queue[0];
        const waitedMin = (tHour - q0.arrivalHour) * 60;
        if (waitedMin > q0.waitTolMin) {
          queue.shift();
          droppedWaitTol++;
        } else {
          break;
        }
      }

      // 2) Assign free stalls to queue first (FCFS)
      assignFromQueueToStalls(
        queue,
        stalls,
        tHour,
        params,
        p,
        waitTimesMin,
        (busyHours, eKwh) => {
          totalBusyHours += busyHours;
          energySoldKwh += eKwh;
          revenue += eKwh * p;
          served++;
        },
      );

      // 3) Generate new arrivals this hour with seasonality + price effect
      const lambda = arrivalsRatePerHour(month, p, params);
      const kArrivals = rng.poisson(lambda);

      for (let i = 0; i < kArrivals; i++) {
        arrivals++;

        // Some skip immediately due to price perception
        const skipProb = priceSkipProbability(p, params);
        if (rng.uniform() < skipProb) {
          droppedPrice++;
          continue;
        }

        const energyKwh = sampleEnergyKwh(rng, params, month);
        const waitTolMin = sampleWaitToleranceMin(rng, params);

        // Try to start service immediately if any stall is free
        const freeIdx = findFreeStallIndex(stalls, tHour);
        if (freeIdx !== -1) {
          const serviceH = serviceTimeHoursFromEnergy(energyKwh, params);
          stalls[freeIdx].busyUntilHour = tHour + serviceH;

          totalBusyHours += serviceH;
          energySoldKwh += energyKwh;
          revenue += energyKwh * p;
          served++;

          waitTimesMin.push(0);
        } else {
          // No free stall -> join queue if space
          if (queue.length < params.qMax) {
            queue.push({ arrivalHour: tHour, waitTolMin, energyKwh });
          } else {
            droppedQueueFull++;
          }
        }
      }

      // 4) After arrivals, again assign if stalls freed within same hour tick
      // (rare with hour ticks, but helps when service times < 1h)
      assignFromQueueToStalls(
        queue,
        stalls,
        tHour,
        params,
        p,
        waitTimesMin,
        (busyHours, eKwh) => {
          totalBusyHours += busyHours;
          energySoldKwh += eKwh;
          revenue += eKwh * p;
          served++;
        },
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
    droppedPrice,

    avgWaitMin,
    p95WaitMin,
    utilization,
  };
}

function assignFromQueueToStalls(
  queue: { arrivalHour: number; waitTolMin: number; energyKwh: number }[],
  stalls: { busyUntilHour: number }[],
  tHour: number,
  params: StationParams,
  p: number,
  waitTimesMin: number[],
  onServe: (busyHours: number, energyKwh: number) => void,
) {
  while (queue.length > 0) {
    const freeIdx = findFreeStallIndex(stalls, tHour);
    if (freeIdx === -1) break;

    const car = queue.shift()!;
    const waitedMin = (tHour - car.arrivalHour) * 60;

    // if they already exceeded tolerance, they leave (should be mostly handled earlier)
    if (waitedMin > car.waitTolMin) {
      // droppedWaitTol counted elsewhere; keep consistent by ignoring here
      continue;
    }

    const serviceH = serviceTimeHoursFromEnergy(car.energyKwh, params);
    stalls[freeIdx].busyUntilHour = tHour + serviceH;

    waitTimesMin.push(waitedMin);
    onServe(serviceH, car.energyKwh);
  }
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
