"use client";

import { useEffect, useRef, useState } from "react";

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
  const [isClient, setIsClient] = useState(false);

  // Marcamos que estamos en el cliente
  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !chartContainerRef.current) return;

    let chart: any = null;

    // Carga dinámica de lightweight-charts SOLO en el navegador
    const initChart = async () => {
      try {
        const { createChart, ColorType, CandlestickSeries } = await import(
          "lightweight-charts"
        );

        if (!chartContainerRef.current) return;

        chart = createChart(chartContainerRef.current, {
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

        const res = await fetch(`/api/ohlcv?coin=${coinId}&days=${timeframe}`);
        const data = await res.json();

        const formattedData = data.map((d: number[]) => ({
          time: Math.floor(d[0] / 1000),
          open: d[1],
          high: d[2],
          low: d[3],
          close: d[4],
        }));

        candlestickSeries.setData(formattedData);

        const handleResize = () => {
          if (chartContainerRef.current) {
            chart.applyOptions({
              width: chartContainerRef.current.clientWidth,
            });
          }
        };
        window.addEventListener("resize", handleResize);

        return () => {
          window.removeEventListener("resize", handleResize);
          chart?.remove();
        };
      } catch (error) {
        console.error("Error al cargar el gráfico:", error);
      }
    };

    initChart();

    return () => {
      if (chart) chart.remove();
    };
  }, [coinId, timeframe, isClient]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2">
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
      <div
        ref={chartContainerRef}
        className="w-full overflow-hidden rounded-xl"
        style={{ minHeight: "400px" }}
      />
    </div>
  );
}
