"use client";
import { useEffect, useRef } from "react";
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts";

export default function CoinChart({ coinId, days }: { coinId: string; days: string }) {
  const chartContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: "#94a3b8" },
      grid: { vertLines: { color: "#1e293b" }, horzLines: { color: "#1e293b" } },
      width: chartContainerRef.current.clientWidth,
      height: 500,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e", downColor: "#ef4444", borderVisible: false,
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    });

    fetch(`/api/ohlcv?coin=${coinId}&days=${days}`)
      .then((res) => res.json())
      .then((data) => {
        // CoinGecko devuelve [timestamp, open, high, low, close]
        const formatted = data.map((d: number[]) => ({
          time: Math.floor(d[0] / 1000), // TradingView usa segundos
          open: d[1], high: d[2], low: d[3], close: d[4],
        }));
        candleSeries.setData(formatted);
      });

    return () => chart.remove();
  }, [coinId, days]);

  return <div ref={chartContainerRef} className="w-full rounded-xl overflow-hidden" />;
}
