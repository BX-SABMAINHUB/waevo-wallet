"use client";

import { useEffect, useState } from "react";
import Highcharts from "highcharts/highstock";
import HighchartsReact from "highcharts-react-official";

interface ChartProps {
  coinId: string;
}

export function HighchartsStockChart({ coinId }: ChartProps) {
  const [options, setOptions] = useState<Highcharts.Options | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Usamos tu propia API Route que ya funciona
        const res = await fetch(`/api/ohlcv?coin=${coinId}&days=365`);
        const data = await res.json();

        // Highcharts Stock espera datos en formato [timestamp, open, high, low, close]
        // o [timestamp, value] para líneas. Para velas japonesas (candlestick)
        // se usa [timestamp, open, high, low, close].
        const ohlc = data.map((d: number[]) => [
          d[0], // timestamp
          d[1], // open
          d[2], // high
          d[3], // low
          d[4], // close
        ]);

        // Calculamos el volumen (si no lo tenemos, lo simulamos con 0 para el ejemplo)
        const volume = data.map((d: number[]) => [
          d[0],
          0, // Aquí podrías poner datos de volumen reales si los tuvieras
        ]);

        setOptions({
          rangeSelector: {
            selected: 1, // Selecciona el botón "1D" por defecto
            buttons: [
              { type: "hour", count: 1, text: "1H" },
              { type: "day", count: 1, text: "1D" },
              { type: "day", count: 5, text: "5D" },
              { type: "day", count: 7, text: "7D" },
              { type: "month", count: 1, text: "1M" },
              { type: "year", count: 1, text: "1A" },
              { type: "all", text: "All" },
            ],
          },
          title: { text: `${coinId.toUpperCase()} Precio` },
          series: [
            {
              type: "candlestick",
              name: coinId,
              data: ohlc,
              tooltip: { valueDecimals: 2 },
            },
            {
              type: "column",
              name: "Volume",
              data: volume,
              yAxis: 1,
              color: "#334155",
            },
          ],
          yAxis: [
            {
              labels: { align: "right", x: -3 },
              title: { text: "OHLC" },
              height: "60%",
              lineWidth: 2,
            },
            {
              labels: { align: "right", x: -3 },
              title: { text: "Volume" },
              top: "65%",
              height: "35%",
              offset: 0,
              lineWidth: 2,
            },
          ],
          tooltip: {
            split: true,
          },
        });
      } catch (error) {
        console.error("Error cargando datos para Highcharts:", error);
      }
    };

    fetchData();
  }, [coinId]);

  // Mientras los datos cargan, mostramos un esqueleto
  if (!options) {
    return (
      <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50" />
    );
  }

  return (
    <HighchartsReact
      highcharts={Highcharts}
      constructorType={"stockChart"} // ¡Clave para usar Highcharts Stock!
      options={options}
    />
  );
}
