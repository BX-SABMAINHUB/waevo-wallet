"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallets, useSendTransaction, usePrivy } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "@/components/motion-client";
import { doc, getDocs, collection } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { 
  Search, ArrowDownLeft, ArrowUpRight, X, Copy, CheckCircle2, 
  ShieldCheck, Wallet, AlertCircle, Loader2, TrendingUp, TrendingDown,
  RefreshCw, Coins, ArrowRight
} from "lucide-react";

// ==========================================
// TIPOS E INTERFACES
// ==========================================
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
  const { sendTransaction } = useSendTransaction();

  // Estados generales
  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [modalType, setModalType] = useState<"send" | "receive" | null>(null);
  
  // Estados de saldo
  const [coinBalances, setCoinBalances] = useState<Record<string, string>>({}); // symbol -> amount
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);

  // Estados del formulario de envío
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Direcciones de depósito
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({}); // symbol -> address
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const userAddress: string = embeddedWallet?.address || "";
  const uid = auth.currentUser?.uid || "";

  // ==========================================
  // 1. CARGAR MONEDAS Y SALDOS
  // ==========================================
  
  // Cargar monedas de CoinGecko
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

  // Cargar todas las billeteras guardadas en Firestore y consultar sus saldos
  const loadAllBalances = async () => {
    if (!uid) return;
    setIsBalanceLoading(true);

    try {
      // 1. Obtener las direcciones de Firestore
      const querySnapshot = await getDocs(collection(db, "users", uid, "wallets"));
      const addresses: Record<string, string> = {};
      querySnapshot.forEach((doc) => {
        addresses[doc.id] = doc.data().address; // doc.id es el symbol (ej. "LTC")
      });
      
      setDepositAddresses(addresses);

      // 2. Consultar el saldo real para cada moneda
      const newBalances: Record<string, string> = {};
      
      for (const [symbol, address] of Object.entries(addresses)) {
        try {
          const res = await fetch('/api/check-deposits', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol, address }),
          });
          
          if (res.ok) {
            const data = await res.json();
            newBalances[symbol] = data.balance || "0";
          }
        } catch (err) {
          console.error(`Error obteniendo saldo de ${symbol}:`, err);
        }
      }

      setCoinBalances(newBalances);
    } catch (error) {
      console.error("Error cargando billeteras:", error);
    } finally {
      setIsBalanceLoading(false);
    }
  };

  // Polling automático cada 30s para actualizar saldos en vivo
  useEffect(() => {
    if (uid && authenticated) {
      loadAllBalances();
      const interval = setInterval(loadAllBalances, 30000);
      return () => clearInterval(interval);
    }
  }, [uid, authenticated]);

  // ==========================================
  // 2. LÓGICA DE ACCIONES
  // ==========================================

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpenReceive = async (coin: Coin) => {
    if (!embeddedWallet || !uid) return;

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
      if (!res.ok) throw new Error(data.error || 'Error generando dirección');

      setDepositAddresses(prev => ({ ...prev, [coin.symbol]: data.address }));
      setSelectedCoin(coin);
      setModalType("receive");
      
      // Refrescar saldos (por si acaso)
      loadAllBalances();
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!embeddedWallet || !selectedCoin) return;
    setIsSending(true);
    try {
      // Aquí irá la lógica real de envío más adelante
      alert(`✅ Transacción de ${sendAmount} ${selectedCoin.symbol} enviada.`);
      setModalType(null);
      setSendAddress("");
      setSendAmount("");
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsSending(false);
    }
  };

  // ==========================================
  // 3. CÁLCULOS
  // ==========================================

  const filteredCoins = coins.filter(
    (coin) =>
      coin.name.toLowerCase().includes(search.toLowerCase()) ||
      coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  // Calcular el valor total en USD (clasificando por moneda, sin mezclar)
  const totalUsd = useMemo(() => {
    let total = 0;
    Object.entries(coinBalances).forEach(([symbol, balance]) => {
      // Buscamos la moneda en CoinGecko por su símbolo para obtener el precio actual
      const coin = coins.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
      if (coin) {
        total += parseFloat(balance) * coin.current_price;
      }
    });
    return total;
  }, [coinBalances, coins]);

  if (!ready) return <div className="p-10 text-center text-white">Cargando entorno seguro...</div>;

  if (!authenticated || !embeddedWallet) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center p-6">
        <motion.div className="max-w-md w-full rounded-3xl border border-indigo-500/30 bg-slate-900/80 p-8 text-center">
          <Wallet size={40} className="mx-auto text-indigo-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Activa tu Billetera</h2>
          <button onClick={login} className="w-full rounded-xl bg-indigo-500 py-3 text-white font-semibold mt-4">
            Crear mi Billetera
          </button>
        </motion.div>
      </div>
    );
  }

  // ==========================================
  // RENDERIZADO
  // ==========================================
  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        
        {/* CABECERA CON BALANCE TOTAL ESTIMADO */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 shadow-xl relative overflow-hidden">
          {/* Fondo decorativo */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 pointer-events-none" />
          
          <div className="flex flex-col md:flex-row md:items-center md:justify-between relative z-10">
            <div>
              <p className="text-sm font-medium text-indigo-300 mb-1 flex items-center gap-2">
                <Coins size={16} /> Balance Total Estimado
              </p>
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight flex items-center gap-4">
                ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                {isBalanceLoading && <Loader2 className="animate-spin text-indigo-400" size={28} />}
              </h1>
              <p className="text-sm text-slate-400 mt-2">
                Suma de todos los saldos confirmados on-chain.
              </p>
            </div>
            
            <button 
              onClick={loadAllBalances} 
              disabled={isBalanceLoading}
              className="mt-4 md:mt-0 flex items-center justify-center gap-2 rounded-xl bg-slate-800 hover:bg-slate-700 px-4 py-2 text-sm text-white transition border border-slate-700 disabled:opacity-50"
            >
              <RefreshCw size={16} className={isBalanceLoading ? "animate-spin" : ""} />
              Actualizar saldos
            </button>
          </div>
        </motion.div>

        {/* BUSCADOR Y LISTA */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white">Tus Activos</h2>
          <div className="relative w-full md:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar moneda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCoins.map((coin) => {
            // Obtener el saldo de esta moneda específica (si existe)
            const balance = coinBalances[coin.symbol.toUpperCase()] || "0.0000";
            const hasBalance = parseFloat(balance) > 0;
            const isPositive = (coin.price_change_percentage_24h || 0) >= 0;
            
            return (
              <motion.div
                key={coin.id}
                whileHover={{ y: -4 }}
                onClick={() => setSelectedCoin(coin)}
                className={`rounded-2xl glass p-5 cursor-pointer transition group ${hasBalance ? 'border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : 'hover:border-indigo-500/40'}`}
              >
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
                    {parseFloat(balance).toFixed(4)} {coin.symbol.toUpperCase()}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* ========================================== */}
      {/* MODAL 1: MENÚ DE ACCIONES (ENVIAR / RECIBIR) */}
      {/* ========================================== */}
      <AnimatePresence>
        {selectedCoin && !modalType && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedCoin(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <img src={selectedCoin.image} className="h-10 w-10" />
                  <h3 className="text-xl font-bold text-white">{selectedCoin.name}</h3>
                </div>
                <button onClick={() => setSelectedCoin(null)} className="text-slate-400 hover:text-white bg-slate-800 p-1 rounded-full"><X size={20} /></button>
              </div>
              
              <div className="mb-4 text-center">
                <p className="text-xs text-slate-400">Saldo disponible</p>
                <p className="text-2xl font-bold text-white">{coinBalances[selectedCoin.symbol.toUpperCase()] || "0.0000"} {selectedCoin.symbol.toUpperCase()}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleOpenReceive(selectedCoin)} className="flex flex-col items-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition">
                  {isGeneratingAddress ? <Loader2 className="animate-spin text-emerald-400" /> : <ArrowDownLeft className="text-emerald-400" size={24} />}
                  <span className="font-semibold text-white">Recibir</span>
                </button>
                <button onClick={() => setModalType("send")} className="flex flex-col items-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition">
                  <ArrowUpRight className="text-indigo-400" size={24} />
                  <span className="font-semibold text-white">Enviar</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================== */}
      {/* MODAL 2: RECIBIR (DIRECCIÓN REAL) */}
      {/* ========================================== */}
      <AnimatePresence>
        {modalType === "receive" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl">
              <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={20} /></button>
              <h3 className="text-2xl font-bold text-white mb-2">Recibir {selectedCoin.name}</h3>
              <p className="text-sm text-slate-400 mb-6">Esta es tu dirección real y permanente.</p>
              
              <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-lg">
                <QRCodeSVG value={depositAddresses[selectedCoin.symbol] || "0x0"} size={200} />
              </div>
              
              <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 border border-slate-700">
                <span className="text-sm font-mono text-slate-300 truncate">{depositAddresses[selectedCoin.symbol]}</span>
                <button onClick={() => copyToClipboard(depositAddresses[selectedCoin.symbol])} className="text-indigo-400 hover:text-white">
                  {copied ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Copy size={20} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-4">Envía únicamente {selectedCoin.symbol.toUpperCase()} a esta dirección.</p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================== */}
      {/* MODAL 3: ENVIAR (PREPARADO PARA EL PASO 2) */}
      {/* ========================================== */}
      <AnimatePresence>
        {modalType === "send" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl relative">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Enviar {selectedCoin.symbol.toUpperCase()}</h3>
                <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={20} /></button>
              </div>
              
              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Dirección del destinatario</label>
                  <input type="text" required value={sendAddress} onChange={e => setSendAddress(e.target.value)} placeholder="0x..." className="w-full p-3 rounded-xl bg-slate-800 text-white outline-none focus:border-indigo-500 border border-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Cantidad</label>
                  <input type="number" step="any" required value={sendAmount} onChange={e => setSendAmount(e.target.value)} placeholder="0.00" className="w-full p-3 rounded-xl bg-slate-800 text-white outline-none focus:border-indigo-500 border border-slate-700" />
                </div>
                <button type="submit" disabled={isSending} className="w-full bg-indigo-500 hover:bg-indigo-600 p-3 rounded-xl text-white font-bold transition disabled:opacity-50 mt-4">
                  {isSending ? "Firmando y enviando..." : "Confirmar Envío"}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
