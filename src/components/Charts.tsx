import ReactECharts from "echarts-for-react";
import type { GridPointResult } from "../sim/types";

type HeatmapDatum = [number, number, number];
type ScatterDatum = [number, number, number, number];
type TooltipValueParam = { value?: unknown };

function uniqSorted<T>(arr: T[], cmp: (a: T, b: T) => number): T[] {
  return Array.from(new Set(arr)).sort(cmp);
}

function formatEuro(x: number): string {
  return `${Math.round(x).toLocaleString()} €`;
}

function makeHeatmapOption(args: {
  title: string;
  Ns: number[];
  Ps: number[];
  data: HeatmapDatum[];
  valueFormatter: (v: number) => string;
  min: number;
  max: number;
}) {
  const { title, Ns, Ps, data, valueFormatter, min, max } = args;
  const pLabels = Ps.map((x) => x.toFixed(2));

  return {
    animation: false,
    title: { text: title, left: 16, top: 10, textStyle: { fontSize: 14 } },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: TooltipValueParam) => {
        const tuple = asHeatmapDatum(p.value);
        if (!tuple) return "No data";
        const [xi, yi, val] = tuple;
        return [
          `<div style="min-width:140px">`,
          `<div><b>N</b>: ${Ns[yi]}</div>`,
          `<div><b>p</b>: ${Ps[xi].toFixed(2)} €/kWh</div>`,
          `<div><b>value</b>: ${valueFormatter(val)}</div>`,
          `</div>`,
        ].join("");
      },
    },
    grid: { top: 55, left: 70, right: 70, bottom: 70 },
    xAxis: {
      type: "category",
      data: pLabels,
      name: "Price (€/kWh)",
      nameLocation: "middle",
      nameGap: 52,
      axisLabel: { rotate: 40, margin: 12, fontSize: 11 },
    },
    yAxis: {
      type: "category",
      data: Ns.map(String),
      name: "N (stalls)",
      nameLocation: "middle",
      nameGap: 52,
      axisLabel: { fontSize: 11 },
    },
    visualMap: {
      min,
      max,
      calculable: true,
      orient: "vertical",
      right: 12,
      top: 55,
      bottom: 70,
      textStyle: { fontSize: 11 },
      formatter: (v: number) => valueFormatter(v),
    },
    dataZoom: [
      {
        type: "slider",
        xAxisIndex: 0,
        bottom: 12,
        height: 18,
        showDetail: false,
      },
    ],
    series: [
      {
        type: "heatmap",
        data,
        progressive: 0,
        itemStyle: { borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
        emphasis: { itemStyle: { borderWidth: 1 } },
      },
    ],
  };
}

// --- Pareto helpers ---
type ParetoPoint = {
  N: number;
  p: number;
  profit: number;
  drop: number;
};

function paretoFront(points: ParetoPoint[]): ParetoPoint[] {
  // Keep points that are not dominated: higher profit AND lower drop is better
  // Sort by drop asc, then keep only increasing profit
  const sorted = [...points].sort(
    (a, b) => a.drop - b.drop || b.profit - a.profit,
  );
  const front: ParetoPoint[] = [];
  let bestProfitSoFar = -Infinity;
  for (const pt of sorted) {
    if (pt.profit > bestProfitSoFar) {
      front.push(pt);
      bestProfitSoFar = pt.profit;
    }
  }
  return front;
}

export function Charts({ results }: { results: GridPointResult[] }) {
  if (results.length === 0) {
    return (
      <div className="rounded-xl border bg-white p-4 shadow-sm text-sm opacity-70">
        No grid points were produced. Check your grid bounds and step values.
      </div>
    );
  }

  const Ns = uniqSorted(
    results.map((r) => r.N),
    (a, b) => a - b,
  );
  const Ps = uniqSorted(
    results.map((r) => r.p),
    (a, b) => a - b,
  );

  const indexP = new Map<number, number>();
  Ps.forEach((p, i) => indexP.set(p, i));
  const indexN = new Map<number, number>();
  Ns.forEach((n, i) => indexN.set(n, i));

  const profitData: HeatmapDatum[] = [];
  const dropData: HeatmapDatum[] = [];

  let minProfit = Infinity,
    maxProfit = -Infinity;
  let minDrop = Infinity,
    maxDrop = -Infinity;

  const scatterPts: ParetoPoint[] = results.map((r) => ({
    N: r.N,
    p: r.p,
    profit: r.mean.profit,
    drop: r.dropRate,
  }));

  for (const r of results) {
    const xi = indexP.get(r.p)!;
    const yi = indexN.get(r.N)!;

    const profit = r.mean.profit;
    const drop = r.dropRate;

    profitData.push([xi, yi, profit]);
    dropData.push([xi, yi, drop]);

    minProfit = Math.min(minProfit, profit);
    maxProfit = Math.max(maxProfit, profit);
    minDrop = Math.min(minDrop, drop);
    maxDrop = Math.max(maxDrop, drop);
  }

  const profitOption = makeHeatmapOption({
    title: "Profit heatmap (N vs price)",
    Ns,
    Ps,
    data: profitData,
    min: minProfit,
    max: maxProfit,
    valueFormatter: (v) => formatEuro(v),
  });

  const dropOption = makeHeatmapOption({
    title: "Drop rate heatmap (N vs price)",
    Ns,
    Ps,
    data: dropData,
    min: minDrop,
    max: maxDrop,
    valueFormatter: (v) => `${(v * 100).toFixed(1)}%`,
  });

  const front = paretoFront(scatterPts);

  const scatterOption = {
    animation: false,
    title: {
      text: "Pareto chart: Profit vs Drop rate",
      left: 16,
      top: 10,
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: "item",
      confine: true,
      formatter: (p: TooltipValueParam) => {
        const tuple = asScatterDatum(p.value);
        if (!tuple) return "No data";
        const [drop, profit, N, price] = tuple;
        return [
          `<div style="min-width:160px">`,
          `<div><b>Profit</b>: ${formatEuro(profit)}</div>`,
          `<div><b>Drop</b>: ${(drop * 100).toFixed(1)}%</div>`,
          `<div><b>N</b>: ${N}</div>`,
          `<div><b>p</b>: ${price.toFixed(2)} €/kWh</div>`,
          `</div>`,
        ].join("");
      },
    },
    grid: { top: 55, left: 70, right: 30, bottom: 55 },
    xAxis: {
      type: "value",
      name: "Drop rate",
      nameLocation: "middle",
      nameGap: 40,
      axisLabel: { formatter: (v: number) => `${Math.round(v * 100)}%` },
      min: Math.max(0, minDrop - 0.01),
      max: Math.min(1, maxDrop + 0.01),
    },
    yAxis: {
      type: "value",
      name: "Profit (€)",
      nameLocation: "middle",
      nameGap: 52,
      axisLabel: { formatter: (v: number) => `${Math.round(v / 1000)}k` },
      min: minProfit - Math.abs(minProfit) * 0.05,
      max: maxProfit + Math.abs(maxProfit) * 0.05,
    },
    series: [
      {
        name: "All points",
        type: "scatter",
        // [drop, profit, N, p] so tooltip can show them
        data: scatterPts.map((pt) => [pt.drop, pt.profit, pt.N, pt.p]),
        symbolSize: 7,
      },
      {
        name: "Pareto front",
        type: "line",
        data: front.map((pt) => [pt.drop, pt.profit, pt.N, pt.p]),
        showSymbol: true,
        symbolSize: 10,
        lineStyle: { width: 2 },
      },
    ],
  };

  return (
    <div className="space-y-8">
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <ReactECharts
          option={profitOption}
          style={{ height: 520, width: "100%" }}
        />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <ReactECharts
          option={dropOption}
          style={{ height: 520, width: "100%" }}
        />
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <ReactECharts
          option={scatterOption}
          style={{ height: 520, width: "100%" }}
        />
      </div>
    </div>
  );
}

function asHeatmapDatum(value: unknown): HeatmapDatum | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [x, y, z] = value;
  if (typeof x !== "number" || typeof y !== "number" || typeof z !== "number")
    return null;
  return [x, y, z];
}

function asScatterDatum(value: unknown): ScatterDatum | null {
  if (!Array.isArray(value) || value.length < 4) return null;
  const [drop, profit, N, p] = value;
  if (
    typeof drop !== "number" ||
    typeof profit !== "number" ||
    typeof N !== "number" ||
    typeof p !== "number"
  ) {
    return null;
  }
  return [drop, profit, N, p];
}
