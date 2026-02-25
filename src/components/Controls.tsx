import React from "react";
import type { NGrid, PriceGrid } from "../sim/types";

export type ControlsValue = {
  nGrid: NGrid;
  pGrid: PriceGrid;
  mcRuns: number;
  seed: number;
  maxDropRateEnabled: boolean;
  maxDropRate: number;
  maxP95Enabled: boolean;
  maxP95WaitMin: number;
};

export function Controls({
  value,
  onChange,
  onRun,
  running,
}: {
  value: ControlsValue;
  onChange: (v: ControlsValue) => void;
  onRun: () => void;
  running: boolean;
}) {
  const set = (patch: Partial<ControlsValue>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Simulation Controls</div>
          <div className="text-sm opacity-70">
            Grid search over N (stalls) and price p (€/kWh)
          </div>
        </div>

        <button
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-50"
          onClick={onRun}
          disabled={running}
        >
          {running ? "Running..." : "Run simulation"}
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* N grid */}
        <Field title="N range (stalls)">
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="N min"
              type="number"
              value={value.nGrid.nMin}
              onChange={(x) =>
                set({ nGrid: { ...value.nGrid, nMin: clampInt(x, 1, 50) } })
              }
            />
            <LabeledInput
              label="N max"
              type="number"
              value={value.nGrid.nMax}
              onChange={(x) =>
                set({ nGrid: { ...value.nGrid, nMax: clampInt(x, 1, 50) } })
              }
            />
          </div>
        </Field>

        {/* Price grid */}
        <Field title="Price grid (€/kWh)">
          <div className="grid grid-cols-3 gap-3">
            <LabeledInput
              label="p min"
              type="number"
              step="0.01"
              value={value.pGrid.pMin}
              onChange={(x) =>
                set({ pGrid: { ...value.pGrid, pMin: clampNum(x, 0.05, 5) } })
              }
            />
            <LabeledInput
              label="p max"
              type="number"
              step="0.01"
              value={value.pGrid.pMax}
              onChange={(x) =>
                set({ pGrid: { ...value.pGrid, pMax: clampNum(x, 0.05, 5) } })
              }
            />
            <LabeledInput
              label="step"
              type="number"
              step="0.01"
              value={value.pGrid.pStep}
              onChange={(x) =>
                set({ pGrid: { ...value.pGrid, pStep: clampNum(x, 0.01, 1) } })
              }
            />
          </div>
        </Field>

        {/* Monte Carlo */}
        <Field title="Monte Carlo">
          <div className="grid grid-cols-2 gap-3">
            <LabeledInput
              label="Runs per grid point"
              type="number"
              value={value.mcRuns}
              onChange={(x) => set({ mcRuns: clampInt(x, 10, 2000) })}
            />
            <LabeledInput
              label="Seed"
              type="number"
              value={value.seed}
              onChange={(x) => set({ seed: clampInt(x, 1, 2_000_000_000) })}
            />
          </div>
          <div className="mt-2 text-xs opacity-70">
            Tip: If it feels slow, reduce N range, increase step, or reduce
            runs.
          </div>
        </Field>

        {/* Constraints */}
        <Field title="Constraints (service quality)">
          <div className="space-y-3">
            <ToggleRow
              label="Enable max drop rate"
              checked={value.maxDropRateEnabled}
              onChange={(c) => set({ maxDropRateEnabled: c })}
            />
            <div className="pl-6">
              <LabeledInput
                label="Max drop rate (e.g. 0.12 = 12%)"
                type="number"
                step="0.01"
                value={value.maxDropRate}
                disabled={!value.maxDropRateEnabled}
                onChange={(x) => set({ maxDropRate: clampNum(x, 0, 1) })}
              />
            </div>

            <ToggleRow
              label="Enable max P95 wait"
              checked={value.maxP95Enabled}
              onChange={(c) => set({ maxP95Enabled: c })}
            />
            <div className="pl-6">
              <LabeledInput
                label="Max P95 wait (minutes)"
                type="number"
                step="0.5"
                value={value.maxP95WaitMin}
                disabled={!value.maxP95Enabled}
                onChange={(x) => set({ maxP95WaitMin: clampNum(x, 0, 240) })}
              />
            </div>
          </div>
        </Field>
      </div>
    </div>
  );
}

function Field({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-sm font-semibold">{title}</div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function LabeledInput(props: {
  label: string;
  type: string;
  value: number;
  step?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="text-xs opacity-70 mb-1">{props.label}</div>
      <input
        className="w-full rounded border px-3 py-2 text-sm disabled:opacity-50"
        type={props.type}
        step={props.step}
        value={Number.isFinite(props.value) ? props.value : 0}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (c: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-3 select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="text-sm">{label}</span>
    </label>
  );
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
