"use client";

import { useMemo } from "react";
import { Bar, Line } from "react-chartjs-2";
import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";

type Row = { time: string; close: number; volume: number | null };
function calculateDrawdown(rows: Row[]) {
  let peak = 0;
  const values: number[] = [];
  for (const row of rows) {
    peak = Math.max(peak, row.close);
    values.push(peak ? ((row.close / peak) - 1) * 100 : 0);
  }
  return values;
}
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Filler, Tooltip);

const baseOptions = {
  responsive: true,
  maintainAspectRatio: false,
  interaction: { intersect: false, mode: "index" as const },
  plugins: {
    legend: { display: false },
    tooltip: { backgroundColor: "#111a20", borderColor: "#34454c", borderWidth: 1, titleColor: "#82919a", bodyColor: "#e5ecef" },
  },
  scales: {
    x: { grid: { display: false }, ticks: { color: "#71818a", maxTicksLimit: 7, maxRotation: 0 } },
    y: { grid: { color: "rgba(89, 107, 115, .2)" }, ticks: { color: "#71818a", maxTicksLimit: 5 } },
  },
} satisfies ChartOptions<"line">;

export default function AnalyticsCharts({ rows, currency }: { rows: Row[]; currency: string }) {
  const labels = useMemo(() => rows.map((row) => new Date(row.time).toLocaleDateString()), [rows]);
  const returnValues = useMemo(() => rows.map((row, index) => index === 0 || !rows[index - 1].close ? 0 : ((row.close / rows[index - 1].close) - 1) * 100), [rows]);
  const cumulativeValues = useMemo(() => rows.map((row) => rows[0]?.close ? ((row.close / rows[0].close) - 1) * 100 : 0), [rows]);
  const drawdownValues = useMemo(() => calculateDrawdown(rows), [rows]);
  const returnsData = useMemo(() => ({ labels, datasets: [{ label: "Per-observation return", data: returnValues, borderColor: "#39d78a", backgroundColor: "rgba(57,215,138,.12)", pointRadius: 0, pointHoverRadius: 3, borderWidth: 1.7, tension: .16, fill: true }] }), [labels, returnValues]);
  const cumulativeData = useMemo(() => ({ labels, datasets: [{ label: "Cumulative return", data: cumulativeValues, borderColor: "#65a9ff", backgroundColor: "rgba(101,169,255,.10)", pointRadius: 0, pointHoverRadius: 3, borderWidth: 1.8, tension: .16, fill: true }] }), [labels, cumulativeValues]);
  const drawdownData = useMemo(() => ({ labels, datasets: [{ label: "Drawdown", data: drawdownValues, borderColor: "#ff7781", backgroundColor: "rgba(255,100,112,.12)", pointRadius: 0, pointHoverRadius: 3, borderWidth: 1.7, tension: .12, fill: true }] }), [labels, drawdownValues]);
  const volumeData = useMemo(() => ({ labels, datasets: [{ label: "Volume", data: rows.map((row) => row.volume ?? 0), backgroundColor: "rgba(57,215,138,.58)", hoverBackgroundColor: "#39d78a", borderRadius: 2 }] }), [labels, rows]);
  const percentOptions = useMemo<ChartOptions<"line">>(() => ({ ...baseOptions, scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, callback: (value) => `${value}%` } } } }), []);
  const volumeOptions = useMemo<ChartOptions<"bar">>(() => ({ ...baseOptions, scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, callback: (value) => Number(value).toLocaleString() } } }, plugins: { ...baseOptions.plugins, tooltip: { ...baseOptions.plugins.tooltip, callbacks: { label: (context) => ` ${Number(context.parsed.y).toLocaleString()} shares` } } } }), []);
  const priceOptions = useMemo<ChartOptions<"line">>(() => ({ ...baseOptions, scales: { ...baseOptions.scales, y: { ...baseOptions.scales.y, ticks: { ...baseOptions.scales.y.ticks, callback: (value) => new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value)) } } } }), [currency]);

  return (
    <div className="analytics-chart-grid">
      <article className="analytics-chart-card"><header><div><span>PRICE TREND</span><small>Closing price through the selected period</small></div></header><div className="analytics-canvas"><Line data={{ labels, datasets: [{ label: "Close", data: rows.map((row) => row.close), borderColor: "#39d78a", backgroundColor: "rgba(57,215,138,.10)", pointRadius: 0, pointHoverRadius: 3, borderWidth: 1.8, tension: .16, fill: true }] }} options={priceOptions} /></div></article>
      <article className="analytics-chart-card"><header><div><span>CUMULATIVE RETURN</span><small>Change from the first close in this range</small></div></header><div className="analytics-canvas"><Line data={cumulativeData} options={percentOptions} /></div></article>
      <article className="analytics-chart-card"><header><div><span>OBSERVATION RETURNS</span><small>Percent change between adjacent price points</small></div></header><div className="analytics-canvas"><Line data={returnsData} options={percentOptions} /></div></article>
      <article className="analytics-chart-card"><header><div><span>DRAWDOWN</span><small>Decline from the highest close reached so far</small></div></header><div className="analytics-canvas"><Line data={drawdownData} options={percentOptions} /></div></article>
      <article className="analytics-chart-card analytics-volume-card"><header><div><span>TRADED VOLUME</span><small>Shares traded for each data point</small></div></header><div className="analytics-canvas"><Bar data={volumeData} options={volumeOptions} /></div></article>
    </div>
  );
}

