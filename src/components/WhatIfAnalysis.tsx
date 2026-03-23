import ReactECharts from "echarts-for-react";
import type { SensitivityResult } from "../sim/types";

export function WhatIfAnalysis({ sensitivity }: { sensitivity: SensitivityResult[] }) {
  if (!sensitivity || sensitivity.length === 0) {
    return null;
  }

  // Sort by absolute impact for the chart
  const sorted = [...sensitivity].sort(
    (a, b) => Math.abs(b.profitChange) - Math.abs(a.profitChange)
  );

  const parameters = sorted.map((s) => s.parameter);
  const changes = sorted.map((s) => s.profitChange);
  const colors = changes.map((c) => (c >= 0 ? "#91cc75" : "#ee6666"));

  const option = {
    title: {
      text: "Sensitivity Analysis: Tornado Chart",
      left: 16,
      top: 10,
      textStyle: { fontSize: 14 },
    },
    tooltip: {
      trigger: "axis",
      axisPointer: { type: "shadow" },
      formatter: (params: unknown) => {
        const data = Array.isArray(params) ? params[0] : null;
        if (!data || typeof data.dataIndex !== 'number') return '';
        const result = sorted[data.dataIndex];
        return `
          <div style="padding: 10px;">
            <strong>${result.parameter}</strong><br/>
            Base value: ${result.baseValue.toFixed(3)}<br/>
            Variation: ±${(result.variation * 100).toFixed(0)}%<br/>
            Profit change: ${result.profitChange > 0 ? "+" : ""}${result.profitChange.toLocaleString()} €<br/>
            Rank: #${result.rank}
          </div>
        `;
      },
    },
    grid: {
      left: 150,
      right: 80,
      top: 60,
      bottom: 40,
    },
    xAxis: {
      type: "value",
      name: "Profit Change (€)",
      axisLabel: {
        formatter: (value: number) => `${(value / 1000).toFixed(0)}k`,
      },
    },
    yAxis: {
      type: "category",
      data: parameters,
      axisLabel: {
        fontSize: 11,
      },
    },
    series: [
      {
        name: "Profit Change",
        type: "bar",
        data: changes.map((value, index) => ({
          value,
          itemStyle: { color: colors[index] },
        })),
        label: {
          show: true,
          position: "right",
          formatter: (params: { value: number }) =>
            `${params.value > 0 ? "+" : ""}${(params.value / 1000).toFixed(1)}k`,
        },
      },
    ],
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <div>
          <div className="text-lg font-semibold">Sensitivity Analysis</div>
          <div className="text-sm opacity-70">
            Impact of ±20% parameter variations on annual profit
          </div>
        </div>
      </div>

      <ReactECharts option={option} style={{ height: 300, width: "100%" }} />

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {sorted.map((result) => (
          <div key={result.parameter} className="rounded-lg border p-3">
            <div className="flex justify-between items-start">
              <div className="text-sm font-semibold">{result.parameter}</div>
              <div
                className={`text-xs px-2 py-1 rounded ${
                  result.profitChange >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                }`}
              >
                #{result.rank}
              </div>
            </div>
            <div className="mt-2 text-xs text-gray-600">
              Base: {result.baseValue.toFixed(3)}
            </div>
            <div
              className={`mt-1 text-sm font-medium ${
                result.profitChange >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {result.profitChange > 0 ? "+" : ""}
              {result.profitChange.toLocaleString()} €
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
