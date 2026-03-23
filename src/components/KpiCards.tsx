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
        <Card 
          label="Profit (€/year)" 
          value={fmtInt(profit)} 
          subvalue={`CI: [${fmtInt(best.profitCI[0])}, ${fmtInt(best.profitCI[1])}]`}
        />
        <Card 
          label="Drop rate" 
          value={`${(drop * 100).toFixed(1)}%`}
          subvalue={`CI: [${(best.dropRateCI[0] * 100).toFixed(1)}%, ${(best.dropRateCI[1] * 100).toFixed(1)}%]`}
        />
        <Card label="P95 wait" value={`${p95.toFixed(1)} min`} />
        <Card label="Utilization" value={`${(util * 100).toFixed(1)}%`} />
      </div>

      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card 
          label="Revenue" 
          value={fmtInt(best.mean.revenue)}
          subvalue={`CI: [${fmtInt(best.revenueCI[0])}, ${fmtInt(best.revenueCI[1])}]`}
        />
        <Card
          label="Energy sold"
          value={`${Math.round(best.mean.energySoldKwh)} kWh`}
        />
        <Card label="Energy cost" value={fmtInt(best.mean.energyCost)} />
        <Card label="Fixed cost" value={fmtInt(best.mean.fixedCost)} />
      </div>

      {/* Risk Metrics */}
      <div className="mt-4 pt-4 border-t">
        <div className="text-sm font-semibold mb-2">Risk Metrics (95% confidence)</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card 
            label="Profit VaR 95%" 
            value={fmtInt(best.profitVaR95)}
            subvalue="5th percentile"
          />
          <Card 
            label="Profit CVaR 95%" 
            value={fmtInt(best.profitCVaR95)}
            subvalue="Avg of worst 5%"
          />
          <Card 
            label="Worst Case" 
            value={fmtInt(best.worstCaseProfit)}
            subvalue="Observed minimum"
          />
          <Card 
            label="Std Error" 
            value={`±${best.stderrProfit.toFixed(0)} €`}
            subvalue="Statistical uncertainty"
          />
        </div>
      </div>

      {/* New Metrics */}
      {best.mean.demandChargeCost > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-sm font-semibold mb-2">Energy & Grid</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card label="Demand Charges" value={fmtInt(best.mean.demandChargeCost)} />
            <Card label="Peak Demand" value={`${best.mean.peakDemandKw.toFixed(1)} kW`} />
            {best.mean.solarGenerationKwh > 0 && (
              <Card 
                label="Solar Generation" 
                value={`${Math.round(best.mean.solarGenerationKwh)} kWh`}
              />
            )}
            {best.mean.batteryCycles > 0 && (
              <Card 
                label="Battery Cycles" 
                value={best.mean.batteryCycles.toFixed(0)}
              />
            )}
          </div>
        </div>
      )}

      {/* Vehicle Class Breakdown */}
      {Object.keys(best.mean.servedByClass).length > 0 && (
        <div className="mt-4 pt-4 border-t">
          <div className="text-sm font-semibold mb-2">By Vehicle Class</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(best.mean.servedByClass).map(([classId, count]) => (
              <Card 
                key={classId}
                label={classId} 
                value={`${Math.round(count)} served`}
                subvalue={`${fmtInt(best.mean.revenueByClass[classId] || 0)} revenue`}
              />
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 text-xs opacity-70">
        stderr(drop): {(best.stderrDropRate * 100).toFixed(2)}%
      </div>
    </div>
  );
}

function Card({ 
  label, 
  value, 
  subvalue 
}: { 
  label: string; 
  value: string;
  subvalue?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs opacity-70">{label}</div>
      <div className="mt-1 text-base font-semibold">{value}</div>
      {subvalue && (
        <div className="mt-1 text-xs text-gray-500">{subvalue}</div>
      )}
    </div>
  );
}

function fmtInt(x: number): string {
  return `${Math.round(x).toLocaleString()} €`;
}
