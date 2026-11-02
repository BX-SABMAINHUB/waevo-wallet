"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "@/components/motion-client";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { 
  Search, ArrowDownLeft, ArrowUpRight, X, Copy, CheckCircle2, 
  Wallet, Loader2, TrendingUp, TrendingDown, Coins, 
  AlertCircle, Send, ShieldAlert, Key, ExternalLink
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
  const [modalType, setModalType] = useState<"receive" | "send" | null>(null);
  
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
  const [copied, setCopied] = useState(false);

  // Estados para el envío
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [privateKey, setPrivateKey] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);

  const uid = auth.currentUser?.uid || "";

  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=100&page=1&sparkline=false");
        const data = await res.json();
        setCoins(data);
      } catch (error) { console.error("Error fetching coins:", error); }
      finally { setLoading(false); }
    }
    fetchCoins();
    const interval = setInterval(fetchCoins, 60000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!uid) return;
    const balancesRef = collection(db, "users", uid, "balances");
    const unsubscribe = onSnapshot(balancesRef, (snapshot) => {
      const newBalances: Record<string, number> = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.amount) newBalances[doc.id] = data.amount;
      });
      setCoinBalances(newBalances);
    });
    return () => unsubscribe();
  }, [uid]);

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

  const handleOpenSend = (coin: Coin) => {
    const balance = coinBalances[coin.symbol.toUpperCase()] || 0;
    if (balance <= 0) {
      alert(`No tienes saldo de ${coin.symbol} para enviar.`);
      return;
    }
    setSelectedCoin(coin);
    setModalType("send");
    setSendError(null);
    setSendSuccess(null);
    setExplorerUrl(null);
    setSendAddress("");
    setSendAmount("");
    setPrivateKey("");
  };

  // 🔥 AQUÍ SE CONECTA CON TU NUEVO ENDPOINT DE BLOCKCYPHER 🔥
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoin) return;

    setSendError(null);
    setSendSuccess(null);
    setExplorerUrl(null);

    const balance = coinBalances[selectedCoin.symbol.toUpperCase()] || 0;
    const amount = parseFloat(sendAmount);
    
    // Calcular comisión estimada (0.01 €)
    const feeCrypto = 0.01 / (selectedCoin.current_price || 1);
    const totalNeeded = amount + feeCrypto;

    if (isNaN(amount) || amount <= 0) {
      setSendError("La cantidad debe ser mayor a 0.");
      return;
    }
    if (totalNeeded > balance) {
      setSendError(`Saldo insuficiente. Necesitas ${totalNeeded.toFixed(6)} ${selectedCoin.symbol} (incluyendo la comisión).`);
      return;
    }
    if (!privateKey.trim()) {
      setSendError("Debes introducir la clave privada (WIF) para firmar la transacción.");
      return;
    }

    setIsSending(true);

    try {
      const res = await fetch('/api/send-blockcypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedCoin.symbol,
          fromAddress: depositAddresses[selectedCoin.symbol], // La dirección de depósito
          toAddress: sendAddress,
          amount: amount,
          privateKey: privateKey, // Clave en formato WIF
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar la transacción');

      // Éxito
      setSendSuccess(`✅ Transacción enviada con éxito.`);
      setExplorerUrl(data.explorerUrl);
      setSendAmount("");
      setSendAddress("");
      setPrivateKey("");

    } catch (error: any) {
      setSendError(error.message || "Error al procesar el envío.");
    } finally {
      setIsSending(false);
    }
  };

  const filteredCoins = coins.filter(
    (coin) => coin.name.toLowerCase().includes(search.toLowerCase()) || coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  const totalEur = useMemo(() => {
    let total = 0;
    Object.entries(coinBalances).forEach(([symbol, amount]) => {
      const coin = coins.find(c => c.symbol.toUpperCase() === symbol.toUpperCase());
      if (coin) total += amount * coin.current_price;
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
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 pointer-events-none" />
          <div className="relative z-10">
            <p className="text-sm font-medium text-indigo-300 mb-1 flex items-center gap-2">
              <Coins size={16} /> Balance Total Estimado
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
              €{totalEur.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h1>
          </div>
        </motion.div>

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
                    <div className="font-medium text-white">€{coin.current_price.toLocaleString("es-ES", { minimumFractionDigits: 2 })}</div>
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
              
              <div className="mb-6 text-center bg-slate-950/50 p-4 rounded-xl border border-slate-800">
                <p className="text-xs text-slate-400 mb-1">Saldo disponible</p>
                <p className="text-2xl font-bold text-white">
                  {(coinBalances[selectedCoin.symbol.toUpperCase()] || 0).toFixed(4)} <span className="text-indigo-400">{selectedCoin.symbol.toUpperCase()}</span>
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleOpenReceive(selectedCoin)} className="flex flex-col items-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition">
                  {isGeneratingAddress ? <Loader2 className="animate-spin text-emerald-400" /> : <ArrowDownLeft className="text-emerald-400" size={24} />}
                  <span className="font-semibold text-white">Recibir</span>
                </button>
                
                <button onClick={() => handleOpenSend(selectedCoin)} disabled={(coinBalances[selectedCoin.symbol.toUpperCase()] || 0) <= 0} className={`flex flex-col items-center gap-2 rounded-2xl p-6 transition ${(coinBalances[selectedCoin.symbol.toUpperCase()] || 0) > 0 ? 'bg-slate-800 hover:bg-slate-700 cursor-pointer' : 'bg-slate-800/50 opacity-50 cursor-not-allowed'}`}>
                  <ArrowUpRight className={(coinBalances[selectedCoin.symbol.toUpperCase()] || 0) > 0 ? "text-indigo-400" : "text-slate-500"} size={24} />
                  <span className={`font-semibold ${(coinBalances[selectedCoin.symbol.toUpperCase()] || 0) > 0 ? 'text-white' : 'text-slate-500'}`}>Enviar</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalType === "receive" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl relative">
              <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={20} /></button>
              <h3 className="text-2xl font-bold text-white mb-2">Recibir {selectedCoin.name}</h3>
              <p className="text-sm text-slate-400 mb-6">Esta es tu dirección real y permanente.</p>
              <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-lg"><QRCodeSVG value={depositAddresses[selectedCoin.symbol] || "0x0"} size={200} /></div>
              <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 border border-slate-700">
                <span className="text-sm font-mono text-slate-300 truncate">{depositAddresses[selectedCoin.symbol]}</span>
                <button onClick={() => { navigator.clipboard.writeText(depositAddresses[selectedCoin.symbol]); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-indigo-400 hover:text-white">
                  {copied ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Copy size={20} />}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {modalType === "send" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl relative">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Enviar {selectedCoin.symbol.toUpperCase()}</h3>
                <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full"><X size={20} /></button>
              </div>

              <div className="mb-6 flex justify-between text-xs bg-slate-950/50 p-3 rounded-lg border border-slate-800">
                <div>
                  <p className="text-slate-400">Disponible</p>
                  <p className="text-white font-medium">{(coinBalances[selectedCoin.symbol.toUpperCase()] || 0).toFixed(4)} {selectedCoin.symbol}</p>
                </div>
                <div className="text-right">
                  <p className="text-slate-400">Comisión de red</p>
                  <p className="text-white font-medium">0.01 €</p>
                </div>
              </div>
              
              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Dirección del destinatario ({selectedCoin.symbol})</label>
                  <input type="text" required value={sendAddress} onChange={e => setSendAddress(e.target.value)} placeholder={`Dirección ${selectedCoin.symbol}...`} className="w-full p-3 rounded-xl bg-slate-800 text-white outline-none focus:border-indigo-500 border border-slate-700 font-mono text-sm" />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Cantidad a enviar</label>
                  <input type="number" step="any" required value={sendAmount} onChange={e => setSendAmount(e.target.value)} placeholder="0.00" className="w-full p-3 rounded-xl bg-slate-800 text-white outline-none focus:border-indigo-500 border border-slate-700" />
                </div>

                <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg">
                  <label className="flex items-center gap-2 text-xs font-medium text-amber-400 mb-2">
                    <Key size={14} /> Clave Privada WIF (Para firmar)
                  </label>
                  <input type="password" required value={privateKey} onChange={e => setPrivateKey(e.target.value)} placeholder="L1a2b3c4d5..." className="w-full p-3 rounded-xl bg-slate-900 text-white outline-none focus:border-amber-500 border border-slate-700 font-mono text-sm" />
                </div>

                {sendError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg flex items-start gap-2">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" /> {sendError}
                  </div>
                )}
                {sendSuccess && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg flex flex-col gap-2">
                    <div className="flex items-center gap-2"><CheckCircle2 size={14} /> {sendSuccess}</div>
                    {explorerUrl && (
                      <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline">
                        Ver transacción en Blockchair <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )}

                <button type="submit" disabled={isSending} className="w-full bg-gradient-to-r from-indigo-500 to-cyan-400 hover:from-indigo-600 hover:to-cyan-500 p-3 rounded-xl text-white font-bold transition disabled:opacity-50 mt-4 flex items-center justify-center gap-2">
                  {isSending ? <><Loader2 className="animate-spin" size={18} /> Firmando y enviando...</> : <><Send size={18} /> Confirmar Envío</>}
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
