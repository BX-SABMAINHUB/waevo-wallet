"use client";

import { useState, useEffect, useMemo } from "react";
import { motion } from "@/components/motion-client";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { 
  ArrowRightLeft, Loader2, ArrowDownUp, AlertCircle, 
  CheckCircle2, Search, TrendingUp, RefreshCw 
} from "lucide-react";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
}

export default function ExchangePage() {
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  
  const [fromCoin, setFromCoin] = useState<Coin | null>(null);
  const [toCoin, setToCoin] = useState<Coin | null>(null);
  const [amount, setAmount] = useState("");
  
  const [isExchanging, setIsExchanging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uid = auth.currentUser?.uid || "";

  // 1. Cargar precios
  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=250&page=1&sparkline=false");
        const data = await res.json();
        setCoins(data);
        
        const prices: Record<string, number> = {};
        data.forEach((c: Coin) => { prices[c.symbol.toUpperCase()] = c.current_price; });
        setLivePrices(prices);
      } catch (error) { console.error("Error fetching coins:", error); }
    }
    fetchCoins();
    const interval = setInterval(fetchCoins, 60000);
    return () => clearInterval(interval);
  }, []);

  // 2. Escuchar saldos en tiempo real
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(collection(db, "users", uid, "balances"), (snapshot) => {
      const balances: Record<string, number> = {};
      snapshot.forEach((doc) => { if (doc.data().amount) balances[doc.id] = doc.data().amount; });
      setCoinBalances(balances);
    });
    return () => unsubscribe();
  }, [uid]);

  // 3. Filtrar monedas de origen: Solo mostramos las que tienen más de 0.05€ en saldo
  const availableFromCoins = useMemo(() => {
    return coins.filter(coin => {
      const balance = coinBalances[coin.symbol.toUpperCase()] || 0;
      const price = livePrices[coin.symbol.toUpperCase()] || 0;
      return (balance * price) >= 0.05;
    });
  }, [coins, coinBalances, livePrices]);

  // 4. Lógica de cálculo en vivo
  const fromPrice = fromCoin ? (livePrices[fromCoin.symbol.toUpperCase()] || 0) : 0;
  const toPrice = toCoin ? (livePrices[toCoin.symbol.toUpperCase()] || 0) : 0;
  const parsedAmount = parseFloat(amount) || 0;
  
  const estimatedReceive = (parsedAmount * fromPrice) / (toPrice || 1);
  const amountInEur = parsedAmount * fromPrice;

  const handleExchange = async () => {
    if (!uid || !fromCoin || !toCoin || parsedAmount <= 0) return;
    setIsExchanging(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          fromSymbol: fromCoin.symbol.toUpperCase(),
          toSymbol: toCoin.symbol.toUpperCase(),
          fromAmount: parsedAmount,
          fromPrice: fromPrice,
          toPrice: toPrice
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al intercambiar');

      setSuccess(data.message);
      setAmount("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsExchanging(false);
    }
  };

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            <ArrowRightLeft className="text-indigo-400" size={28} /> Exchange y Cambios
          </h1>
          <p className="text-slate-400 text-sm">Intercambia tus activos al instante con precios de mercado.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
          
          {/* MONEDA QUE DAS */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-400 mb-2">Moneda que das</label>
            <div className="relative">
              <select 
                onChange={(e) => setFromCoin(coins.find(c => c.id === e.target.value) || null)}
                value={fromCoin?.id || ""}
                className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl p-4 pl-12 text-white outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="" disabled>Selecciona una moneda...</option>
                {availableFromCoins.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.symbol.toUpperCase()} - {c.name} ({(coinBalances[c.symbol.toUpperCase()] || 0).toFixed(4)})
                  </option>
                ))}
              </select>
              {fromCoin ? (
                <img src={fromCoin.image} className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full" />
              ) : (
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              )}
            </div>
            {availableFromCoins.length === 0 && (
              <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                <AlertCircle size={12} /> Necesitas al menos 0,05 € en alguna moneda para poder intercambiar.
              </p>
            )}
          </div>

          {/* CANTIDAD A DAR */}
          {fromCoin && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-400 mb-2">
                <span>Cantidad a enviar</span>
                <span>Disponible: {(coinBalances[fromCoin.symbol.toUpperCase()] || 0).toFixed(6)} {fromCoin.symbol.toUpperCase()}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any"
                  placeholder="0.00"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500"
                />
                <button 
                  onClick={() => setAmount((coinBalances[fromCoin.symbol.toUpperCase()] || 0).toString())}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-indigo-400"
                >
                  MAX
                </button>
              </div>
              {amount && <p className="text-xs text-right text-slate-500 mt-1">≈ €{amountInEur.toFixed(2)} EUR</p>}
            </div>
          )}

          {/* ICONO DE CAMBIO */}
          <div className="flex justify-center -my-3 relative z-10">
            <div className="bg-slate-900 border border-slate-700 rounded-full p-2 text-slate-400">
              <ArrowDownUp size={20} />
            </div>
          </div>

          {/* MONEDA QUE RECIBES */}
          <div className="mb-8">
            <label className="block text-sm font-medium text-slate-400 mb-2">Moneda que recibes</label>
            <div className="relative">
              <select 
                onChange={(e) => setToCoin(coins.find(c => c.id === e.target.value) || null)}
                value={toCoin?.id || ""}
                className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl p-4 pl-12 text-white outline-none focus:border-indigo-500 cursor-pointer"
              >
                <option value="" disabled>Selecciona una moneda de destino...</option>
                {coins.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.symbol.toUpperCase()} - {c.name}
                  </option>
                ))}
              </select>
              {toCoin ? (
                <img src={toCoin.image} className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full" />
              ) : (
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
              )}
            </div>
            {toCoin && amount && (
              <p className="text-sm text-right text-emerald-400 mt-2 font-medium">
                Recibirás ≈ {estimatedReceive.toFixed(6)} {toCoin.symbol.toUpperCase()}
              </p>
            )}
          </div>

          {/* FEEDBACK Y BOTÓN */}
          {error && <div className="p-3 mb-4 bg-red-500/10 text-red-400 text-sm rounded-lg flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
          {success && <div className="p-3 mb-4 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg flex items-center gap-2"><CheckCircle2 size={16} />{success}</div>}

          <button
            onClick={handleExchange}
            disabled={isExchanging || !fromCoin || !toCoin || parsedAmount <= 0 || parsedAmount > (coinBalances[fromCoin.symbol.toUpperCase()] || 0)}
            className="w-full bg-gradient-to-r from-indigo-500 to-cyan-400 p-4 rounded-xl text-white font-bold text-lg shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isExchanging ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            {isExchanging ? "Procesando Cambio..." : "Confirmar Cambio"}
          </button>

        </motion.div>
      </div>
    </div>
  );
}
