import ReactECharts from "echarts-for-react";
import type { YearProjection } from "../sim/types";

export function ScenarioComparison({ projections }: { projections: YearProjection[] }) {
  if (!projections || projections.length === 0) {
    return null;
  }

  const years = projections.map((p) => p.year);
  const profits = projections.map((p) => p.mean.profit);
  const cumulativeProfits = projections.map((p) => p.cumulativeProfit);
  const npvs = projections.map((p) => p.netPresentValue);

  const option = {
    title: {
      text: "Multi-Year Financial Projection",
      left: 16,
      top: 10,
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "cross" },
    },
    legend: {
      data: ["Annual Profit", "Cumulative Profit", "NPV"],
      bottom: 10,
    },
    grid: {
      left: 80,
      right: 80,
      top: 60,
      bottom: 80,
    },
    xAxis: {
      type: "category",
      data: years,
      name: "Year",
      nameLocation: "middle",
      nameGap: 30,
    },
    yAxis: [
      {
        type: "value",
        name: "Profit (€)",
        position: "left",
        axisLabel: {
          formatter: (value: number) => `${(value / 1000).toFixed(0)}k`,
        },
      },
      {
        type: "value",
        name: "NPV (€)",
        position: "right",
        axisLabel: {
          formatter: (value: number) => `${(value / 1000).toFixed(0)}k`,
        },
      },
    ],
    series: [
      {
        name: "Annual Profit",
        type: "bar",
        data: profits,
        itemStyle: { color: "#5470c6" },
      },
      {
        name: "Cumulative Profit",
        type: "line",
        data: cumulativeProfits,
        smooth: true,
        lineStyle: { width: 3 },
        itemStyle: { color: "#91cc75" },
      },
      {
        name: "NPV",
        type: "line",
        yAxisIndex: 1,
        data: npvs,
        smooth: true,
        lineStyle: { width: 3, type: "dashed" },
        itemStyle: { color: "#fac858" },
      },
    ],
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-lg font-semibold">Multi-Year Projection</div>
          <div className="text-sm opacity-70">
            {projections.length}-year financial forecast with NPV
          </div>
        </div>
        <div className="text-right">
          <div className="text-sm opacity-70">Final Cumulative Profit</div>
          <div className="text-lg font-semibold">
            {projections[projections.length - 1]?.cumulativeProfit.toLocaleString("en-US", {
              style: "currency",
              currency: "EUR",
              maximumFractionDigits: 0,
            })}
          </div>
        </div>
      </div>
      <ReactECharts option={option} style={{ height: 400, width: "100%" }} />
    </div>
  );
}
