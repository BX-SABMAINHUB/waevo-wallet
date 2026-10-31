"use client";

import { useState, useEffect } from "react";
import { Search, TrendingUp, TrendingDown, X } from "lucide-react";

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

  // 1. Buscamos las monedas usando la API
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

  // 2. Filtro para la barra de búsqueda
  const filteredCoins = coins.filter(
    (coin) =>
      coin.name.toLowerCase().includes(search.toLowerCase()) ||
      coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  // 3. Función para crear el enlace del gráfico gigante (usando un iframe HTML puro)
  const getTradingViewUrl = (coin: Coin) => {
    // Pasamos el símbolo a mayúsculas (ej: btc -> BTC)
    const symbol = `${coin.symbol.toUpperCase()}USDT`;
    // Esta es la URL del widget de TradingView
    return `https://s.tradingview.com/widgetembed/?symbol=BINANCE%3A${symbol}&interval=D&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=dark&style=1&timezone=Etc%2FUTC&withdateranges=1&showpopupbutton=1`;
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        
        {/* CABECERA Y BARRA DE BÚSQUEDA */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Explorar monedas</h1>
            <p className="mt-1 text-sm text-slate-400">
              Busca cualquier criptomoneda y abre su gráfico avanzado.
            </p>
          </div>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar moneda (ej. BTC)..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 md:w-72"
            />
          </div>
        </div>

        {/* LISTA DE MONEDAS */}
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
                className="cursor-pointer rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-indigo-500/50 hover:bg-slate-800"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.name} className="h-8 w-8 rounded-full" />
                    <div>
                      <h3 className="font-semibold text-white">{coin.name}</h3>
                      <span className="text-xs uppercase text-slate-400">{coin.symbol}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-white">
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

      {/* PANTALLA COMPLETA CON EL GRÁFICO HTML */}
      {selectedCoin && (
        <div className="fixed inset-0 z-50 flex flex-col bg-slate-950">
          {/* Barra superior del gráfico */}
          <div className="flex items-center justify-between border-b border-slate-800 p-4">
            <div className="flex items-center gap-3">
              <img src={selectedCoin.image} alt={selectedCoin.name} className="h-8 w-8" />
              <h2 className="text-xl font-bold text-white">
                {selectedCoin.name} ({selectedCoin.symbol.toUpperCase()})
              </h2>
            </div>
            <button
              onClick={() => setSelectedCoin(null)}
              className="rounded-lg bg-slate-800 p-2 text-slate-400 hover:bg-slate-700 hover:text-white transition"
            >
              <X size={24} />
            </button>
          </div>
          
          {/* El iframe con el gráfico puro de TradingView (HTML puro) */}
          <div className="flex-1 w-full bg-slate-900">
            <iframe
              src={getTradingViewUrl(selectedCoin)}
              style={{ width: "100%", height: "100%", border: "none" }}
              allowFullScreen
              title="Gráfico Avanzado"
            />
          </div>
        </div>
      )}
    </div>
  );
}
