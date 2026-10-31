"use client";

import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts";

const TIMEFRAMES = [
  { label: "1H", days: "1" },
  { label: "1D", days: "1" },
  { label: "5D", days: "5" },
  { label: "7D", days: "7" },
  { label: "1M", days: "30" },
  { label: "1A", days: "365" },
];

export function CoinChart({ coinId }: { coinId: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const [timeframe, setTimeframe] = useState("1");

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 400,
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    fetch(`/api/ohlcv?coin=${coinId}&days=${timeframe}`)
      .then((res) => res.json())
      .then((data) => {
        // CoinGecko devuelve [timestamp, open, high, low, close]
        const formattedData = data.map((d: number[]) => ({
          time: Math.floor(d[0] / 1000), // TradingView usa segundos
          open: d[1],
          high: d[2],
          low: d[3],
          close: d[4],
        }));
        candlestickSeries.setData(formattedData);
      })
      .catch((err) => console.error("Error cargando gráfico:", err));

    const handleResize = () => {
      chart.applyOptions({ width: chartContainerRef.current?.clientWidth });
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, [coinId, timeframe]);

  return (
    <div>
      <div className="mb-4 flex gap-2">
        {TIMEFRAMES.map((tf) => (
          <button
            key={tf.label}
            onClick={() => setTimeframe(tf.days)}
            className={`rounded-lg px-3 py-1 text-xs font-medium transition ${
              timeframe === tf.days
                ? "bg-indigo-500 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>
      <div ref={chartContainerRef} className="w-full overflow-hidden rounded-xl" />
    </div>
  );
}
