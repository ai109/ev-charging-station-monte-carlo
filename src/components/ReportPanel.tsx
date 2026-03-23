import { useMemo } from "react";
import type { GridPointResult, StationParams } from "../sim/types";

function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function toCsv(results: GridPointResult[]) {
  const header = [
    "N",
    "p",
    "profit_mean",
    "profit_CI_lower",
    "profit_CI_upper",
    "dropRate_mean",
    "dropRate_CI_lower",
    "dropRate_CI_upper",
    "p95Wait_mean",
    "util_mean",
    "revenue_mean",
    "revenue_CI_lower",
    "revenue_CI_upper",
    "energySoldKwh_mean",
    "demandChargeCost",
    "solarGenerationKwh",
    "batteryCycles",
    "peakDemandKw",
    "stderrProfit",
    "stderrDropRate",
    "profitVaR95",
    "profitCVaR95",
    "worstCaseProfit",
  ].join(",");

  const rows = results.map((r) =>
    [
      r.N,
      r.p.toFixed(3),
      r.mean.profit.toFixed(2),
      r.profitCI[0].toFixed(2),
      r.profitCI[1].toFixed(2),
      r.dropRate.toFixed(6),
      r.dropRateCI[0].toFixed(6),
      r.dropRateCI[1].toFixed(6),
      r.mean.p95WaitMin.toFixed(3),
      r.mean.utilization.toFixed(6),
      r.mean.revenue.toFixed(2),
      r.revenueCI[0].toFixed(2),
      r.revenueCI[1].toFixed(2),
      r.mean.energySoldKwh.toFixed(2),
      r.mean.demandChargeCost.toFixed(2),
      r.mean.solarGenerationKwh.toFixed(2),
      r.mean.batteryCycles.toFixed(0),
      r.mean.peakDemandKw.toFixed(2),
      r.stderrProfit.toFixed(3),
      r.stderrDropRate.toFixed(6),
      r.profitVaR95.toFixed(2),
      r.profitCVaR95.toFixed(2),
      r.worstCaseProfit.toFixed(2),
    ].join(","),
  );

  return [header, ...rows].join("\n");
}

export function ReportPanel({
  params,
  best,
  results,
}: {
  params: StationParams;
  best: GridPointResult | null;
  results: GridPointResult[] | null;
}) {
  const summary = useMemo(() => {
    if (!best)
      return "No feasible best found. Relax constraints or expand the grid.";

    const lines = [
      `EV Charging Station — Monte Carlo Simulation (1 year)`,
      ``,
      `Decision variables (grid search):`,
      `- N (stalls): ${results ? Math.min(...results.map((r) => r.N)) : "?"}..${results ? Math.max(...results.map((r) => r.N)) : "?"}`,
      `- p (€/kWh): ${results ? Math.min(...results.map((r) => r.p)).toFixed(2) : "?"}..${results ? Math.max(...results.map((r) => r.p)).toFixed(2) : "?"}`,
      ``,
      `Best configuration (max profit under constraints):`,
      `- N* = ${best.N}`,
      `- p* = ${best.p.toFixed(2)} €/kWh`,
      ``,
      `Key results (mean over Monte Carlo runs):`,
      `- Profit: ${Math.round(best.mean.profit).toLocaleString()} € / year`,
      `- Profit CI 95%: [${Math.round(best.profitCI[0]).toLocaleString()}, ${Math.round(best.profitCI[1]).toLocaleString()}] €`,
      `- Profit VaR 95%: ${Math.round(best.profitVaR95).toLocaleString()} €`,
      `- Revenue: ${Math.round(best.mean.revenue).toLocaleString()} € / year`,
      `- Drop rate: ${(best.dropRate * 100).toFixed(1)}%`,
      `- P95 wait: ${best.mean.p95WaitMin.toFixed(1)} min`,
      `- Utilization: ${(best.mean.utilization * 100).toFixed(1)}%`,
      ``,
      `Model assumptions (parameters):`,
      `- Power per stall: ${params.powerKw} kW`,
      `- Queue capacity: ${params.qMax} cars`,
      `- Open hours/day: ${params.openHours}`,
      `- Grid cost: ${params.gridCostPerKwh.toFixed(2)} €/kWh`,
      `- Fixed cost/year: ${Math.round(params.fixedCostPerYear).toLocaleString()} €`,
      `- Fixed cost per stall/year: ${Math.round(params.fixedCostPerStallPerYear).toLocaleString()} €`,
      `- Vehicle classes: ${params.vehicleClasses.length} types`,
    ];

    // Add vehicle class details
    for (const vc of params.vehicleClasses) {
      lines.push(
        `  - ${vc.name}: ${(vc.proportion * 100).toFixed(0)}% of traffic, avg ${vc.energyKwhMean.toFixed(1)} kWh/session`,
      );
    }

    lines.push(
      `- Wait tolerance (minutes): mean=${params.waitTolMeanMin.toFixed(1)}, std=${params.waitTolStdMin.toFixed(1)}, min=${params.waitTolMin.toFixed(1)}, max=${params.waitTolMax.toFixed(1)}`,
      ``,
      `Seasonality: base arrivals/h by month (Jan..Dec):`,
      `- ${params.baseArrivalsPerHourByMonth.map((x) => x.toFixed(2)).join(", ")}`,
      `Temperature (avg °C Jan..Dec):`,
      `- ${params.avgTempCByMonth.map((x) => x.toFixed(1)).join(", ")}`,
      ``,
      `Price-demand: pRef=${params.pRef.toFixed(2)}, elasticity=${params.priceElasticity.toFixed(2)}`,
      `Temperature model: refTemp=${params.refTempC.toFixed(1)} °C, sensitivity=${params.tempSensitivity.toFixed(3)} per °C`,
    );

    // Add TOU pricing info if configured
    if (params.touSchedule && params.touSchedule.length > 0) {
      lines.push(
        ``,
        `Time-of-Use Pricing:`,
      );
      for (const period of params.touSchedule) {
        lines.push(
          `  - ${period.hourStart}:00-${period.hourEnd}:00 @ ${period.costPerKwh.toFixed(2)} €/kWh`,
        );
      }
    }

    // Add dynamic pricing info
    if (params.dynamicPricing?.enabled) {
      lines.push(
        ``,
        `Dynamic Pricing:`,
        `- Base price: ${params.dynamicPricing.basePrice.toFixed(2)} €/kWh`,
        `- Surge multiplier: ${params.dynamicPricing.surgeMultiplier.toFixed(1)}x`,
        `- Threshold: ${(params.dynamicPricing.thresholdUtilization * 100).toFixed(0)}% utilization`,
      );
    }

    // Add solar info
    if (params.solarConfig && params.solarConfig.capacityKw > 0) {
      lines.push(
        ``,
        `Solar Configuration:`,
        `- Capacity: ${params.solarConfig.capacityKw} kW`,
        `- Efficiency: ${(params.solarConfig.efficiency * 100).toFixed(0)}%`,
        `- Annual degradation: ${(params.solarConfig.degradationPerYear * 100).toFixed(1)}%`,
      );
    }

    // Add battery info
    if (params.batteryConfig && params.batteryConfig.capacityKwh > 0) {
      lines.push(
        ``,
        `Battery Storage:`,
        `- Capacity: ${params.batteryConfig.capacityKwh} kWh`,
        `- Max charge/discharge: ${params.batteryConfig.maxChargeKw}/${params.batteryConfig.maxDischargeKw} kW`,
        `- Round-trip efficiency: ${(params.batteryConfig.chargeEfficiency * params.batteryConfig.dischargeEfficiency * 100).toFixed(0)}%`,
      );
    }

    lines.push(
      ``,
      `Simulation notes:`,
      `- Continuous-time arrivals are sampled within each operating hour.`,
      `- Queue abandonment is evaluated for all waiting vehicles.`,
      `- Price effect is modeled via the arrival-rate demand factor.`,
      `- Multiple vehicle classes with different characteristics.`,
    );

    return lines.join("\n");
  }, [best, params, results]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm text-gray-900">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Report & Export</div>
          <div className="text-sm opacity-70">
            Copy/paste summary into your A4 report, or export grid results.
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="px-3 py-2 rounded border"
            onClick={() => navigator.clipboard.writeText(summary)}
            disabled={!best}
          >
            Copy summary
          </button>
          <button
            className="px-3 py-2 rounded border"
            onClick={() =>
              results &&
              downloadText("grid_results.csv", toCsv(results), "text/csv")
            }
            disabled={!results}
          >
            Export CSV
          </button>
          <button
            className="px-3 py-2 rounded border"
            onClick={() =>
              results &&
              downloadText(
                "grid_results.json",
                JSON.stringify(results, null, 2),
                "application/json",
              )
            }
            disabled={!results}
          >
            Export JSON
          </button>
        </div>
      </div>

      <textarea
        className="mt-4 w-full rounded border p-3 text-sm font-mono"
        rows={16}
        value={summary}
        readOnly
      />
    </div>
  );
}
