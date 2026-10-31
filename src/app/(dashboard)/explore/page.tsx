"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { Search, TrendingUp, TrendingDown, X } from "lucide-react";

// 🔥 LA SOLUCIÓN: Cargamos el gráfico SOLO en el navegador
const TradingViewWidget = dynamic(
  () => import("@/components/charts/TradingViewWidget").then((mod) => mod.TradingViewWidget),
  { ssr: false }
);

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
}

export default function ExplorePage() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);

  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false"
        );
        const data = await res.json();
        setCoins(data);
      } catch (error) {
        console.error("Error fetching coins:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCoins();
  }, []);

  const filteredCoins = coins.filter(
    (coin) =>
      coin.name.toLowerCase().includes(search.toLowerCase()) ||
      coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const getTradingViewSymbol = (coin: Coin) => {
    const symbol = coin.symbol.toUpperCase();
    return `BINANCE:${symbol}USDT`;
  };

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Explorar monedas</h1>
            <p className="mt-1 text-sm text-slate-400">
              Busca una moneda y abre su gráfico profesional al instante.
            </p>
          </div>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar moneda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 md:w-72"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-24 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCoins.map((coin) => (
              <div
                key={coin.id}
                onClick={() => setSelectedCoin(coin)}
                className="cursor-pointer group block rounded-2xl glass p-5 transition hover:border-indigo-500/40 hover:-translate-y-1"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.name} className="h-8 w-8 rounded-full" />
                    <div>
                      <h3 className="font-semibold">{coin.name}</h3>
                      <span className="text-xs uppercase text-slate-400">{coin.symbol}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      ${coin.current_price.toLocaleString()}
                    </div>
                    <div
                      className={`flex items-center justify-end gap-1 text-xs font-medium ${
                        (coin.price_change_percentage_24h || 0) >= 0
                          ? "text-emerald-400"
                          : "text-red-400"
                      }`}
                    >
                      {(coin.price_change_percentage_24h || 0) >= 0 ? (
                        <TrendingUp size={14} />
                      ) : (
                        <TrendingDown size={14} />
                      )}
                      {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL GIGANTE CON EL GRÁFICO DE TRADINGVIEW */}
      {selectedCoin && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setSelectedCoin(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-6xl rounded-2xl border border-slate-700 bg-slate-900 p-2 shadow-2xl"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <img src={selectedCoin.image} alt={selectedCoin.name} className="h-8 w-8" />
                <h2 className="text-xl font-bold">{selectedCoin.name} ({selectedCoin.symbol.toUpperCase()})</h2>
              </div>
              <button
                onClick={() => setSelectedCoin(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="mt-2 h-[600px] w-full rounded-xl overflow-hidden">
              {/* El gráfico se carga de forma segura gracias al dynamic import */}
              <TradingViewWidget symbol={getTradingViewSymbol(selectedCoin)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
