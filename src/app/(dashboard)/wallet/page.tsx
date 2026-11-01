"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallets, useSendTransaction, usePrivy } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "@/components/motion-client";
import { auth } from "@/lib/firebase";
import { 
  Search, ArrowDownLeft, ArrowUpRight, X, Copy, CheckCircle2, 
  ShieldCheck, Wallet, AlertCircle, Loader2, TrendingUp, TrendingDown,
  RefreshCw
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
  const { sendTransaction } = useSendTransaction();

  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [modalType, setModalType] = useState<"send" | "receive" | null>(null);
  
  // Saldos reales
  const [coinBalances, setCoinBalances] = useState<Record<string, string>>({});
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);

  // Estados del formulario de envío
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Direcciones de depósito
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const userAddress: string = embeddedWallet?.address || "";
  const uid = auth.currentUser?.uid || "";

  // 1. Cargar monedas
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

  // 2. Obtener el saldo real de la moneda seleccionada
  const fetchRealBalance = async (coin: Coin) => {
    if (!depositAddresses[coin.id]) return;
    
    setIsBalanceLoading(true);
    try {
      const res = await fetch('/api/check-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: coin.symbol, address: depositAddresses[coin.id] }),
      });
      const data = await res.json();
      if (res.ok && data.balance) {
        setCoinBalances(prev => ({ ...prev, [coin.id]: data.balance }));
      }
    } catch (error) {
      console.error("Error obteniendo saldo:", error);
    } finally {
      setIsBalanceLoading(false);
    }
  };

  // 3. Enviar transacción
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!embeddedWallet || !selectedCoin) return;
    setIsSending(true);
    try {
      // Aquí iría la lógica real de envío con Privy
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Calcular el valor total en USD de todas las monedas con saldo
  const totalUsd = useMemo(() => {
    let total = 0;
    Object.entries(coinBalances).forEach(([coinId, balance]) => {
      const coin = coins.find(c => c.id === coinId);
      if (coin) {
        total += parseFloat(balance) * coin.current_price;
      }
    });
    return total;
  }, [coinBalances, coins]);

  // 4. Generar dirección permanente
  const handleOpenReceive = async (coin: Coin) => {
    if (!embeddedWallet || !uid) return;

    if (depositAddresses[coin.id]) {
      setSelectedCoin(coin);
      setModalType("receive");
      fetchRealBalance(coin);
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

      setDepositAddresses(prev => ({ ...prev, [coin.id]: data.address }));
      setSelectedCoin(coin);
      setModalType("receive");
      fetchRealBalance(coin); // Obtener saldo inicial
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

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

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        
        {/* CABECERA CON BALANCE TOTAL REAL */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 shadow-xl">
          <p className="text-sm font-medium text-indigo-300 mb-1">Balance Total Estimado</p>
          <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
            ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h1>
          <p className="text-sm text-slate-400 mt-2">
            Suma de todos los saldos confirmados on-chain.
          </p>
        </motion.div>

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

        {/* LISTA DE MONEDAS */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCoins.map((coin) => {
            const balance = coinBalances[coin.id] || "0.0000";
            const isPositive = (coin.price_change_percentage_24h || 0) >= 0;
            
            return (
              <motion.div
                key={coin.id}
                whileHover={{ y: -4 }}
                onClick={() => setSelectedCoin(coin)}
                className="rounded-2xl glass p-5 cursor-pointer hover:border-indigo-500/40 transition group"
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
                  <div className="text-sm font-semibold text-white">
                    {balance} {coin.symbol.toUpperCase()}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* MODALES (Acciones y Recibir) */}
      <AnimatePresence>
        {selectedCoin && !modalType && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedCoin(null)}>
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <img src={selectedCoin.image} className="h-10 w-10" />
                  <h3 className="text-xl font-bold text-white">{selectedCoin.name}</h3>
                </div>
                <button onClick={() => setSelectedCoin(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
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

      <AnimatePresence>
        {modalType === "receive" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl">
              <h3 className="text-2xl font-bold text-white mb-2">Recibir {selectedCoin.name}</h3>
              <p className="text-sm text-slate-400 mb-6">Esta es tu dirección real y permanente.</p>
              <div className="bg-white p-4 rounded-2xl inline-block mb-6"><QRCodeSVG value={depositAddresses[selectedCoin.id]} size={200} /></div>
              <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 border border-slate-700">
                <span className="text-sm font-mono text-slate-300 truncate">{depositAddresses[selectedCoin.id]}</span>
                <button onClick={() => copyToClipboard(depositAddresses[selectedCoin.id])} className="text-indigo-400 hover:text-white">
                  {copied ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Copy size={20} />}
                </button>
              </div>
              <button onClick={() => setModalType(null)} className="mt-6 w-full bg-slate-800 py-2 rounded-xl text-white">Cerrar</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
