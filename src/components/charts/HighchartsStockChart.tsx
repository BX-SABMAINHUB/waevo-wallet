"use client";

import { useEffect, useState } from "react";
import { StockChart } from "@highcharts/react/Stock";

interface ChartProps {
  coinId: string;
}

export function HighchartsStockChart({ coinId }: ChartProps) {
  const [ohlcData, setOhlcData] = useState<number[][]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/ohlcv?coin=${coinId}&days=365`);
        
        if (!res.ok) {
          throw new Error("Error al obtener los datos del gráfico");
        }
        
        const data = await res.json();
        
        // Formatear datos: [timestamp, open, high, low, close]
        const formattedData = data.map((d: number[]) => [
          d[0], // timestamp
          d[1], // open
          d[2], // high
          d[3], // low
          d[4], // close
        ]);
        
        setOhlcData(formattedData);
      } catch (error) {
        console.error("Error cargando datos para Highcharts:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [coinId]);

  if (isLoading) {
    return (
      <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50 flex items-center justify-center">
        <span className="text-slate-500 text-sm">Cargando gráfico...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px]">
      <StockChart
        options={{
          chart: {
            backgroundColor: "transparent",
            style: {
              fontFamily: "inherit",
            },
          },
          rangeSelector: {
            selected: 1, // Selecciona "1M" por defecto
            inputEnabled: false,
            buttons: [
              { type: "hour", count: 1, text: "1H" },
              { type: "day", count: 1, text: "1D" },
              { type: "day", count: 5, text: "5D" },
              { type: "day", count: 7, text: "7D" },
              { type: "month", count: 1, text: "1M" },
              { type: "year", count: 1, text: "1A" },
              { type: "all", text: "Max" },
            ],
            buttonTheme: {
              fill: "#1e293b",
              stroke: "none",
              style: {
                color: "#94a3b8",
              },
              states: {
                hover: {
                  fill: "#334155",
                  style: { color: "#ffffff" },
                },
                select: {
                  fill: "#6366f1",
                  style: { color: "#ffffff", fontWeight: "bold" },
                },
              },
            },
          },
          navigator: {
            enabled: true,
            maskFill: "rgba(99, 102, 241, 0.15)",
            outlineColor: "#334155",
            series: {
              color: "#6366f1",
            },
          },
          scrollbar: {
            enabled: false,
          },
          title: {
            text: `${coinId.charAt(0).toUpperCase() + coinId.slice(1)} Precio`,
            style: {
              color: "#f1f5f9",
            },
          },
          xAxis: {
            gridLineColor: "#1e293b",
            labels: {
              style: { color: "#94a3b8" },
            },
          },
          yAxis: [
            {
              gridLineColor: "#1e293b",
              labels: {
                align: "right",
                x: -3,
                style: { color: "#94a3b8" },
              },
              title: { text: "OHLC" },
              height: "60%",
              lineWidth: 2,
            },
            {
              labels: {
                align: "right",
                x: -3,
                style: { color: "#94a3b8" },
              },
              title: { text: "Volume" },
              top: "65%",
              height: "35%",
              offset: 0,
              lineWidth: 2,
            },
          ],
          tooltip: {
            split: true,
            backgroundColor: "#0f172a",
            borderColor: "#334155",
            style: {
              color: "#f1f5f9",
            },
          },
          series: [
            {
              type: "candlestick",
              name: coinId.toUpperCase(),
              data: ohlcData,
              color: "#ef4444",
              upColor: "#22c55e",
              lineColor: "#ef4444",
              upLineColor: "#22c55e",
              tooltip: {
                valueDecimals: 2,
              },
            },
          ],
        }}
      />
    </div>
  );
}
