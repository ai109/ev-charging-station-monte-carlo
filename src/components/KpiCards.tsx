import type { GridPointResult } from "../sim/types";

export function KpiCards({ best }: { best: GridPointResult | null }) {
  if (!best) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm text-gray-900">
        <div className="text-sm opacity-70">
          No feasible best found (try relaxing constraints).
        </div>
      </div>
    );
  }

  const profit = best.mean.profit;
  const drop = best.dropRate;
  const p95 = best.mean.p95WaitMin;
  const util = best.mean.utilization;

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm text-gray-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">Best configuration</div>
          <div className="text-sm opacity-70">
            Max profit under selected constraints
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm opacity-70">Decision</div>
          <div className="text-lg font-semibold">
            N={best.N}, p={best.p.toFixed(2)} €/kWh
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Profit (€/year)" value={fmtInt(profit)} />
        <Card label="Drop rate" value={`${(drop * 100).toFixed(1)}%`} />
        <Card label="P95 wait" value={`${p95.toFixed(1)} min`} />
        <Card label="Utilization" value={`${(util * 100).toFixed(1)}%`} />
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Revenue" value={fmtInt(best.mean.revenue)} />
        <Card
          label="Energy sold"
          value={`${Math.round(best.mean.energySoldKwh)} kWh`}
        />
        <Card label="Energy cost" value={fmtInt(best.mean.energyCost)} />
        <Card label="Fixed cost" value={fmtInt(best.mean.fixedCost)} />
      </div>

      <div className="mt-3 text-xs opacity-70">
        stderr(profit): {best.stderrProfit.toFixed(0)} €, stderr(drop):{" "}
        {(best.stderrDropRate * 100).toFixed(2)}%
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
    </div>
  );
}

function fmtInt(x: number): string {
  return `${Math.round(x).toLocaleString()} €`;
}
