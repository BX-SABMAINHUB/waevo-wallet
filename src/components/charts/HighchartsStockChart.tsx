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
        if (!res.ok) throw new Error("Error al obtener los datos del gráfico");
        
        const data = await res.json();
        const formattedData = data.map((d: number[]) => [
          d[0], d[1], d[2], d[3], d[4]
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
          chart: { backgroundColor: "transparent" },
          rangeSelector: {
            selected: 1,
            buttons: [
              { type: "hour", count: 1, text: "1H" },
              { type: "day", count: 1, text: "1D" },
              { type: "day", count: 5, text: "5D" },
              { type: "day", count: 7, text: "7D" },
              { type: "month", count: 1, text: "1M" },
              { type: "year", count: 1, text: "1A" },
              { type: "all", text: "Max" },
            ],
          },
          navigator: { enabled: true },
          title: { text: `${coinId.toUpperCase()} Precio` },
          series: [{
            type: "candlestick",
            name: coinId.toUpperCase(),
            data: ohlcData,
            color: "#ef4444",
            upColor: "#22c55e",
            tooltip: { valueDecimals: 2 },
          }],
        }}
      />
    </div>
  );
}
