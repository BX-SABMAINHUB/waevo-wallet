"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "@/components/motion-client";
import { doc, onSnapshot, collection, setDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { 
  Search, ArrowDownLeft, ArrowUpRight, X, Copy, CheckCircle2, 
  Wallet, Loader2, TrendingUp, TrendingDown, Coins, RefreshCw
} from "lucide-react";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
}

export default function WalletPage() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();

  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [modalType, setModalType] = useState<"receive" | null>(null);
  
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
  const [copied, setCopied] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const uid = auth.currentUser?.uid || "";

  // Cargar precios de monedas
  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false");
        const data = await res.json();
        setCoins(data);
      } catch (error) { console.error("Error fetching coins:", error); } 
      finally { setLoading(false); }
    }
    fetchCoins();
  }, []);

  // Escuchar cambios en los saldos de Firestore en tiempo real
  useEffect(() => {
    if (!uid) return;

    const balancesRef = collection(db, "users", uid, "balances");
    const unsubscribe = onSnapshot(balancesRef, (snapshot) => {
      const newBalances: Record<string, number> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        // Guardamos el saldo asociado al ID del documento (ej. "LTC")
        if (data.amount) newBalances[doc.id] = data.amount;
      });
      setCoinBalances(newBalances);
    });

    return () => unsubscribe();
  }, [uid]);

  // Cargar direcciones de depósito
  useEffect(() => {
    async function loadAddresses() {
      if (!uid) return;
      // (Aquí podrías cargar las direcciones existentes de Firestore si lo deseas)
    }
    loadAddresses();
  }, [uid]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenReceive = async (coin: Coin) => {
    if (!uid) return;

    if (depositAddresses[coin.symbol]) {
      setSelectedCoin(coin);
      setModalType("receive");
      return;
    }

    setIsGeneratingAddress(true);
    try {
      const res = await fetch('/api/generate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: coin.symbol, userId: uid }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setDepositAddresses(prev => ({ ...prev, [coin.symbol]: data.address }));
      setSelectedCoin(coin);
      setModalType("receive");
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  const filteredCoins = coins.filter(
    (coin) => coin.name.toLowerCase().includes(search.toLowerCase()) || coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  // Calcular el valor total clasificando por moneda
  const totalUsd = useMemo(() => {
    let total = 0;
    Object.entries(coinBalances).forEach(([symbol, amount]) => {
      const coin = coins.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
      if (coin) {
        total += amount * coin.current_price;
      }
    });
    return total;
  }, [coinBalances, coins]);

  if (!ready) return <div className="p-10 text-center text-white">Cargando entorno seguro...</div>;

  if (!authenticated) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center p-6">
        <motion.div className="max-w-md w-full rounded-3xl border border-indigo-500/30 bg-slate-900/80 p-8 text-center">
          <Wallet size={40} className="mx-auto text-indigo-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Activa tu Billetera</h2>
          <button onClick={login} className="w-full rounded-xl bg-indigo-500 py-3 text-white font-semibold mt-4">Crear mi Billetera</button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        
        {/* CABECERA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 pointer-events-none" />
          
          <div className="relative z-10">
            <p className="text-sm font-medium text-indigo-300 mb-1 flex items-center gap-2">
              <Coins size={16} /> Balance Total Estimado (Reclamado)
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight flex items-center gap-4">
              ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h1>
            <p className="text-sm text-slate-400 mt-2">
              Este es el saldo que has reclamado desde tu historial.
            </p>
          </div>
        </motion.div>

        {/* LISTA */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white">Tus Activos</h2>
          <div className="relative w-full md:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input type="text" placeholder="Buscar moneda..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500" />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCoins.map((coin) => {
            const balance = coinBalances[coin.symbol.toUpperCase()] || 0;
            const hasBalance = balance > 0;
            const isPositive = (coin.price_change_percentage_24h || 0) >= 0;
            
            return (
              <motion.div key={coin.id} whileHover={{ y: -4 }} onClick={() => setSelectedCoin(coin)} className={`rounded-2xl glass p-5 cursor-pointer transition group ${hasBalance ? 'border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'hover:border-indigo-500/40'}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <img src={coin.image} className="h-10 w-10 rounded-full group-hover:scale-110 transition" />
                    <div>
                      <h3 className="font-semibold text-white">{coin.name}</h3>
                      <span className="text-xs uppercase text-slate-400">{coin.symbol}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-white">${coin.current_price.toLocaleString()}</div>
                    <div className={`flex items-center justify-end gap-1 text-xs font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                      {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                  <div className="text-sm text-slate-400">Tu saldo</div>
                  <div className={`text-sm font-semibold ${hasBalance ? 'text-indigo-400' : 'text-white'}`}>
                    {balance.toFixed(4)} {coin.symbol.toUpperCase()}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* MODAL ACCIONES */}
      <AnimatePresence>
        {selectedCoin && !modalType && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedCoin(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3"><img src={selectedCoin.image} className="h-10 w-10" /><h3 className="text-xl font-bold text-white">{selectedCoin.name}</h3></div>
                <button onClick={() => setSelectedCoin(null)} className="text-slate-400 hover:text-white bg-slate-800 p-1 rounded-full"><X size={20} /></button>
              </div>
              <div className="mb-4 text-center">
                <p className="text-xs text-slate-400">Saldo disponible</p>
                <p className="text-2xl font-bold text-white">{(coinBalances[selectedCoin.symbol.toUpperCase()] || 0).toFixed(4)} {selectedCoin.symbol.toUpperCase()}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleOpenReceive(selectedCoin)} className="flex flex-col items-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition">
                  {isGeneratingAddress ? <Loader2 className="animate-spin text-emerald-400" /> : <ArrowDownLeft className="text-emerald-400" size={24} />}
                  <span className="font-semibold text-white">Recibir</span>
                </button>
                <button onClick={() => alert("El envío estará disponible en el Paso 2")} className="flex flex-col items-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition opacity-50 cursor-not-allowed">
                  <ArrowUpRight className="text-indigo-400" size={24} />
                  <span className="font-semibold text-white">Enviar</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL RECIBIR */}
      <AnimatePresence>
        {modalType === "receive" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl">
              <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={20} /></button>
              <h3 className="text-2xl font-bold text-white mb-2">Recibir {selectedCoin.name}</h3>
              <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-lg"><QRCodeSVG value={depositAddresses[selectedCoin.symbol] || "0x0"} size={200} /></div>
              <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 border border-slate-700">
                <span className="text-sm font-mono text-slate-300 truncate">{depositAddresses[selectedCoin.symbol]}</span>
                <button onClick={() => copyToClipboard(depositAddresses[selectedCoin.symbol])} className="text-indigo-400 hover:text-white">
                  {copied ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Copy size={20} />}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
