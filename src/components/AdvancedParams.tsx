import { useState } from "react";
import type { StationParams } from "../sim/types";

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

const MIN_POSITIVE = 0.001;

export function AdvancedParams({
  value,
  onChange,
  onReset,
}: {
  value: StationParams;
  onChange: (v: StationParams) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  const patch = (partial: Partial<StationParams>) => {
    onChange({ ...value, ...partial });
  };

  const patchEnergy = (partial: Partial<StationParams>) => {
    onChange(normalizeEnergy({ ...value, ...partial }));
  };

  const patchWait = (partial: Partial<StationParams>) => {
    onChange(normalizeWaitTolerance({ ...value, ...partial }));
  };

  const baseArrivals = normalizeMonthArray(value.baseArrivalsPerHourByMonth, 1);
  const avgTemps = normalizeMonthArray(value.avgTempCByMonth, 10);

  const setBaseArrival = (month: number, raw: number) => {
    const next = [...baseArrivals];
    next[month] = clampNum(raw, MIN_POSITIVE, 200);
    patch({ baseArrivalsPerHourByMonth: next });
  };

  const setAvgTemp = (month: number, raw: number) => {
    const next = [...avgTemps];
    next[month] = clampNum(raw, -40, 60);
    patch({ avgTempCByMonth: next });
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Advanced Parameters</div>
          <div className="text-sm opacity-70">
            Tune simulation assumptions used by the worker model.
          </div>
        </div>

        <div className="flex gap-2">
          <button className="px-3 py-2 rounded border" onClick={onReset}>
            Reset to defaults
          </button>
          <button
            className="px-3 py-2 rounded border bg-black text-white"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Hide advanced" : "Show advanced"}
          </button>
        </div>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ParamInput
              label="Reference price pRef (€/kWh)"
              helper="This is the baseline price used by the elasticity demand model."
              value={value.pRef}
              step="0.01"
              onChange={(x) => patch({ pRef: clampNum(x, MIN_POSITIVE, 20) })}
            />

            <ParamInput
              label="Price elasticity ε (unitless)"
              helper="This controls how strongly arrivals change when price changes."
              value={value.priceElasticity}
              step="0.01"
              onChange={(x) =>
                patch({ priceElasticity: clampNum(x, MIN_POSITIVE, 20) })
              }
            />

            <ParamInput
              label="Grid energy cost (€/kWh)"
              helper="This is the variable electricity purchase cost paid per delivered kWh."
              value={value.gridCostPerKwh}
              step="0.01"
              onChange={(x) =>
                patch({ gridCostPerKwh: clampNum(x, 0, 20) })
              }
            />

            <ParamInput
              label="Power per stall (kW)"
              helper="This sets charging power per stall and directly affects service duration."
              value={value.powerKw}
              step="1"
              onChange={(x) => patch({ powerKw: clampNum(x, MIN_POSITIVE, 1000) })}
            />

            <ParamInput
              label="Queue capacity qMax (cars)"
              helper="This limits how many vehicles can wait before new arrivals are dropped."
              value={value.qMax}
              step="1"
              onChange={(x) => patch({ qMax: clampInt(x, 0, 2000) })}
            />

            <ParamInput
              label="Open hours per day (hours/day)"
              helper="This sets how many operating hours are simulated for each day."
              value={value.openHours}
              step="1"
              onChange={(x) => patch({ openHours: clampInt(x, 1, 24) })}
            />

            <ParamInput
              label="Fixed cost per year (€/year)"
              helper="This captures annual overhead independent of stall count."
              value={value.fixedCostPerYear}
              step="100"
              onChange={(x) =>
                patch({ fixedCostPerYear: clampNum(x, 0, 10_000_000) })
              }
            />

            <ParamInput
              label="Fixed cost per stall (€/stall/year)"
              helper="This captures annualized cost for each installed stall."
              value={value.fixedCostPerStallPerYear}
              step="100"
              onChange={(x) =>
                patch({
                  fixedCostPerStallPerYear: clampNum(x, 0, 10_000_000),
                })
              }
            />

            <ParamInput
              label="Energy mean (kWh/session)"
              helper="This is the expected energy demand of a charging session."
              value={value.energyKwhMean}
              step="0.1"
              onChange={(x) => patchEnergy({ energyKwhMean: clampNum(x, 0, 500) })}
            />

            <ParamInput
              label="Energy std dev (kWh/session)"
              helper="This controls variability of per-session energy demand."
              value={value.energyKwhStd}
              step="0.1"
              onChange={(x) => patchEnergy({ energyKwhStd: clampNum(x, 0, 500) })}
            />

            <ParamInput
              label="Energy minimum (kWh/session)"
              helper="This is the lower bound applied to sampled session energy."
              value={value.energyKwhMin}
              step="0.1"
              onChange={(x) => patchEnergy({ energyKwhMin: clampNum(x, 0, 500) })}
            />

            <ParamInput
              label="Energy maximum (kWh/session)"
              helper="This is the upper bound applied to sampled session energy."
              value={value.energyKwhMax}
              step="0.1"
              onChange={(x) =>
                patchEnergy({ energyKwhMax: clampNum(x, MIN_POSITIVE, 500) })
              }
            />

            <ParamInput
              label="Wait tolerance mean (minutes)"
              helper="This is the average maximum waiting time customers accept."
              value={value.waitTolMeanMin}
              step="0.1"
              onChange={(x) =>
                patchWait({ waitTolMeanMin: clampNum(x, 0, 1440) })
              }
            />

            <ParamInput
              label="Wait tolerance std dev (minutes)"
              helper="This controls variability in customer waiting tolerance."
              value={value.waitTolStdMin}
              step="0.1"
              onChange={(x) =>
                patchWait({ waitTolStdMin: clampNum(x, 0, 1440) })
              }
            />

            <ParamInput
              label="Wait tolerance minimum (minutes)"
              helper="This is the lower bound applied to sampled waiting tolerance."
              value={value.waitTolMin}
              step="0.1"
              onChange={(x) => patchWait({ waitTolMin: clampNum(x, 0, 1440) })}
            />

            <ParamInput
              label="Wait tolerance maximum (minutes)"
              helper="This is the upper bound applied to sampled waiting tolerance."
              value={value.waitTolMax}
              step="0.1"
              onChange={(x) =>
                patchWait({ waitTolMax: clampNum(x, MIN_POSITIVE, 1440) })
              }
            />

            <ParamInput
              label="Temperature sensitivity (per °C)"
              helper="This controls how demand shifts per degree from reference temperature."
              value={value.tempSensitivity}
              step="0.001"
              onChange={(x) => patch({ tempSensitivity: clampNum(x, -2, 2) })}
            />

            <ParamInput
              label="Reference temperature (°C)"
              helper="This is the reference temperature where the temperature factor equals one."
              value={value.refTempC}
              step="0.1"
              onChange={(x) => patch({ refTempC: clampNum(x, -40, 60) })}
            />
          </div>

          <MonthGroup
            title="Monthly Base Arrivals (arrivals/hour)"
            helper="This is the baseline arrival rate for the month before price and temperature effects."
            values={baseArrivals}
            onChange={setBaseArrival}
            step="0.01"
          />

          <MonthGroup
            title="Monthly Average Temperature (°C)"
            helper="This is the average monthly temperature used in the temperature demand factor."
            values={avgTemps}
            onChange={setAvgTemp}
            step="0.1"
          />
        </div>
      )}
    </div>
  );
}

function ParamInput({
  label,
  helper,
  value,
  step,
  onChange,
}: {
  label: string;
  helper: string;
  value: number;
  step: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs opacity-70">{helper}</div>
      <label className="block mt-2">
        <div className="text-xs font-semibold mb-1">{label}</div>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          type="number"
          step={step}
          value={Number.isFinite(value) ? value : 0}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    </div>
  );
}

function MonthGroup({
  title,
  helper,
  values,
  onChange,
  step,
}: {
  title: string;
  helper: string;
  values: number[];
  onChange: (month: number, value: number) => void;
  step: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {MONTHS.map((month, idx) => (
          <div key={month} className="rounded border p-2">
            <div className="text-[11px] opacity-70">{helper}</div>
            <label className="block mt-1">
              <div className="text-xs font-semibold mb-1">{month}</div>
              <input
                className="w-full rounded border px-2 py-1.5 text-sm"
                type="number"
                step={step}
                value={Number.isFinite(values[idx]) ? values[idx] : 0}
                onChange={(e) => onChange(idx, Number(e.target.value))}
              />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

function normalizeMonthArray(values: number[], defaultValue: number): number[] {
  const out = new Array<number>(12);
  for (let i = 0; i < 12; i++) {
    const x = values[i];
    out[i] = Number.isFinite(x) ? x : defaultValue;
  }
  return out;
}

function normalizeEnergy(params: StationParams): StationParams {
  const min = clampNum(params.energyKwhMin, 0, 500);
  const rawMax = clampNum(params.energyKwhMax, MIN_POSITIVE, 500);
  const max = Math.max(rawMax, min === 0 ? MIN_POSITIVE : min);
  const mean = clampNum(params.energyKwhMean, min, max);
  const std = clampNum(params.energyKwhStd, 0, 500);

  return {
    ...params,
    energyKwhMin: min,
    energyKwhMax: max,
    energyKwhMean: mean,
    energyKwhStd: std,
  };
}

function normalizeWaitTolerance(params: StationParams): StationParams {
  const min = clampNum(params.waitTolMin, 0, 1440);
  const rawMax = clampNum(params.waitTolMax, MIN_POSITIVE, 1440);
  const max = Math.max(rawMax, min === 0 ? MIN_POSITIVE : min);
  const mean = clampNum(params.waitTolMeanMin, min, max);
  const std = clampNum(params.waitTolStdMin, 0, 1440);

  return {
    ...params,
    waitTolMin: min,
    waitTolMax: max,
    waitTolMeanMin: mean,
    waitTolStdMin: std,
  };
}

function clampNum(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.max(lo, Math.min(hi, x));
}

function clampInt(x: number, lo: number, hi: number): number {
  const n = Math.round(x);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
