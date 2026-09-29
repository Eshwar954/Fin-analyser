"use client";

import { useMemo } from "react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  Filler,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
  type ChartOptions,
} from "chart.js";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip);

type Point = { time: string; close: number };
type Props = { rows: Point[]; currency: string; symbol: string; formatMoney: (value: number, currency: string) => string };

export default function PriceChart({ rows, currency, symbol, formatMoney }: Props) {
  const data = useMemo(() => ({
    labels: rows.map((row) => new Date(row.time).toLocaleDateString()),
    datasets: [{
      label: `${symbol} close`,
      data: rows.map((row) => row.close),
      borderColor: "#39d78a",
      backgroundColor: "rgba(57, 215, 138, 0.12)",
      borderWidth: 2,
      pointRadius: 0,
      pointHoverRadius: 4,
      fill: true,
      tension: 0.22,
    }],
  }), [rows, symbol]);
  const options = useMemo<ChartOptions<"line">>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: "index" },
    plugins: {
      legend: { display: true },
      tooltip: {
        displayColors: false,
        backgroundColor: "#111a20",
        borderColor: "#34454c",
        borderWidth: 1,
        titleColor: "#82919a",
        bodyColor: "#e5ecef",
        callbacks: { label: (context) => formatMoney(Number(context.parsed.y), currency) },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#71818a", maxTicksLimit: 6, maxRotation: 0 } },
      y: { grid: { color: "rgba(89, 107, 115, .2)", borderDash: [4, 4] }, ticks: { color: "#71818a", maxTicksLimit: 4, callback: (value) => formatMoney(Number(value), currency) } },
    },
  }), [currency, formatMoney]);
  return <Line data={data} options={options} aria-label={`${symbol} historical close prices`} />;
}
