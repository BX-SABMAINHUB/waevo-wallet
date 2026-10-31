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

  // 1. Nos aseguramos de que esto solo se ejecute en el navegador
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 2. Cargamos el gráfico dinámicamente
  useEffect(() => {
    if (!isClient || !chartContainerRef.current) return;

    let chart: any = null;
    let isMounted = true;

    const initChart = async () => {
      try {
        // 🔥 LA CLAVE: Importación dinámica. 
        // Al no estar en el "top level", el servidor de Next.js no lo empaqueta.
        const { createChart, ColorType, CandlestickSeries } = await import(
          "lightweight-charts"
        );

        if (!chartContainerRef.current || !isMounted) return;

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

        // API de lightweight-charts v5
        const candlestickSeries = chart.addSeries(CandlestickSeries, {
          upColor: "#22c55e",
          downColor: "#ef4444",
          borderVisible: false,
          wickUpColor: "#22c55e",
          wickDownColor: "#ef4444",
        });

        // Hacemos la petición a nuestra propia API Route
        const res = await fetch(`/api/ohlcv?coin=${coinId}&days=${timeframe}`);
        
        if (!res.ok) throw new Error("Error al obtener los datos del gráfico");
        
        const data = await res.json();

        // Formateamos los datos para TradingView
        const formattedData = data.map((d: number[]) => ({
          time: Math.floor(d[0] / 1000), // Convertir milisegundos a segundos
          open: d[1],
          high: d[2],
          low: d[3],
          close: d[4],
        }));

        if (isMounted) {
          candlestickSeries.setData(formattedData);
        }

        // Manejo del redimensionado de la ventana
        const handleResize = () => {
          if (chartContainerRef.current && chart) {
            chart.applyOptions({
              width: chartContainerRef.current.clientWidth,
            });
          }
        };

        window.addEventListener("resize", handleResize);
        (chart as any)._handleResize = handleResize;

      } catch (error) {
        console.error("Error al inicializar el gráfico:", error);
      }
    };

    initChart();

    // Limpieza al desmontar el componente o cambiar de moneda/tiempo
    return () => {
      isMounted = false;
      if (chart) {
        if ((chart as any)._handleResize) {
          window.removeEventListener("resize", (chart as any)._handleResize);
        }
        chart.remove();
      }
    };
  }, [coinId, timeframe, isClient]);

  return (
    <div>
      {/* Selector de tiempo */}
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

      {/* Contenedor del gráfico */}
      <div
        ref={chartContainerRef}
        className="w-full overflow-hidden rounded-xl"
        style={{ minHeight: "400px" }}
      />
    </div>
  );
}
