"use client";

import { use } from "react";
import { TradingViewWidget } from "@/components/charts/TradingViewWidget";

interface CoinPageProps {
  params: Promise<{ id: string }>;
}

export default function CoinPage({ params }: CoinPageProps) {
  const { id } = use(params);

  // Mapeo para que las monedas más populares se vean correctamente en TradingView
  const symbolMap: Record<string, string> = {
    bitcoin: "BINANCE:BTCUSDT",
    ethereum: "BINANCE:ETHUSDT",
    solana: "BINANCE:SOLUSDT",
    cardano: "BINANCE:ADAUSDT",
    ripple: "BINANCE:XRPUSDT",
    dogecoin: "BINANCE:DOGEUSDT",
    polkadot: "BINANCE:DOTUSDT",
    chainlink: "BINANCE:LINKUSDT",
    avalanche: "BINANCE:AVAXUSDT",
    polygon: "BINANCE:MATICUSDT",
  };

  const tradingViewSymbol = symbolMap[id.toLowerCase()] || `BINANCE:${id.toUpperCase()}USDT`;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-6 text-3xl font-bold capitalize">
          {id.replace(/-/g, " ")}
        </h1>
        <div className="rounded-2xl glass p-2 md:p-4 overflow-hidden">
          {/* El gráfico de TradingView se carga aquí */}
          <TradingViewWidget symbol={tradingViewSymbol} />
        </div>
      </div>
    </div>
  );
}
