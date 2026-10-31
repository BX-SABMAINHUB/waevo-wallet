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
  const [isMounted, setIsMounted] = useState(false);

  // 1. Solo nos montamos en el cliente
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // 2. Cargamos el gráfico de forma segura
  useEffect(() => {
    if (!isMounted || !chartContainerRef.current) return;

    let chart: any = null;
    let isCancelled = false;

    const initChart = async () => {
      try {
        // Importación dinámica (solo se ejecuta en el navegador)
        const lib = await import("lightweight-charts");
        const { createChart, ColorType, CandlestickSeries } = lib;

        if (isCancelled || !chartContainerRef.current) return;

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
        if (!res.ok) throw new Error("Error al cargar datos");
        
        const data = await res.json();
        const formattedData = data.map((d: number[]) => ({
          time: Math.floor(d[0] / 1000),
          open: d[1],
          high: d[2],
          low: d[3],
          close: d[4],
        }));

        if (!isCancelled) {
          candlestickSeries.setData(formattedData);
        }

        const handleResize = () => {
          if (chartContainerRef.current && chart) {
            chart.applyOptions({ width: chartContainerRef.current.clientWidth });
          }
        };

        window.addEventListener("resize", handleResize);
        (chart as any)._resizeHandler = handleResize;

      } catch (error) {
        console.error("Error al inicializar gráfico:", error);
      }
    };

    initChart();

    return () => {
      isCancelled = true;
      if (chart) {
        if ((chart as any)._resizeHandler) {
          window.removeEventListener("resize", (chart as any)._resizeHandler);
        }
        chart.remove();
      }
    };
  }, [coinId, timeframe, isMounted]);

  if (!isMounted) {
    return <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50" />;
  }

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
