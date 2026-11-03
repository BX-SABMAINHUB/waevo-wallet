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
  AlertCircle, Send, ExternalLink, RefreshCw
} from "lucide-react";

interface Coin { id: string; symbol: string; name: string; image: string; current_price: number; price_change_percentage_24h: number; }

export default function WalletPage() {
  const { ready, authenticated, login } = usePrivy();
  
  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [modalType, setModalType] = useState<"receive" | "send" | null>(null);
  
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);

  // Precios en tiempo real (Ticker)
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  const [priceTrends, setPriceTrends] = useState<Record<string, "up" | "down" | "same">>({});

  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendSuccess, setSendSuccess] = useState<string | null>(null);
  const [explorerUrl, setExplorerUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const uid = auth.currentUser?.uid || "";

  // 1. Sincronizar precios reales cada 60s
  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=100&page=1&sparkline=false");
        const data = await res.json();
        setCoins(data);
        
        setLivePrices(prev => {
          const next = { ...prev };
          data.forEach((coin: Coin) => { next[coin.symbol.toUpperCase()] = coin.current_price; });
          return next;
        });
      } catch (error) { console.error("Error fetching coins:", error); }
    }
    fetchCoins();
    const interval = setInterval(fetchCoins, 60000);
    return () => clearInterval(interval);
  }, []);

  // 2. Ticker simulado cada 1 segundo (Fluctuaciones)
  useEffect(() => {
    const ticker = setInterval(() => {
      setLivePrices((prev) => {
        const next = { ...prev };
        const trends: Record<string, "up" | "down" | "same"> = {};

        Object.keys(next).forEach((symbol) => {
          const fluctuation = (Math.random() - 0.5) * 0.001; 
          const oldPrice = next[symbol];
          const newPrice = oldPrice * (1 + fluctuation);
          next[symbol] = Math.round(newPrice * 1000000) / 1000000;

          if (newPrice > oldPrice) trends[symbol] = "up";
          else if (newPrice < oldPrice) trends[symbol] = "down";
          else trends[symbol] = "same";
        });

        setPriceTrends(trends);
        return next;
      });
    }, 1000);
    return () => clearInterval(ticker);
  }, []);

  // 3. Escuchar saldos
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(collection(db, "users", uid, "balances"), (snapshot) => {
      const newBalances: Record<string, number> = {};
      snapshot.forEach((doc) => { if (doc.data().amount) newBalances[doc.id] = doc.data().amount; });
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
    } catch (error: any) { alert(`❌ Error: ${error.message}`); } 
    finally { setIsGeneratingAddress(false); }
  };

  const handleOpenSend = (coin: Coin) => {
    if ((coinBalances[coin.symbol.toUpperCase()] || 0) <= 0) {
      alert(`No tienes saldo de ${coin.symbol} para enviar.`);
      return;
    }
    setSelectedCoin(coin);
    setModalType("send");
    setSendError(null); setSendSuccess(null); setExplorerUrl(null);
    setSendAddress(""); setSendAmount("");
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCoin || !uid) return;
    setIsSending(true); setSendError(null); setSendSuccess(null); setExplorerUrl(null);

    try {
      const res = await fetch('/api/send-blockcypher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: selectedCoin.symbol,
          userId: uid,
          toAddress: sendAddress,
          amount: parseFloat(sendAmount),
        }),
      });

      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } 
      catch (err) { throw new Error("Error interno en el servidor."); }

      if (!res.ok) throw new Error(data.error || 'Error al enviar');

      setSendSuccess(`✅ Transacción enviada con éxito.`);
      setExplorerUrl(data.explorerUrl);
      setSendAmount(""); setSendAddress("");
    } catch (error: any) {
      setSendError(error.message);
    } finally { setIsSending(false); }
  };

  const filteredCoins = coins.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.symbol.toLowerCase().includes(search.toLowerCase()));
  
  const totalEur = useMemo(() => Object.entries(coinBalances).reduce((acc, [sym, amt]) => {
    return acc + (amt * (livePrices[sym] || 0));
  }, 0), [coinBalances, livePrices]);

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;
  if (!authenticated) return <div className="p-10 text-center text-white">Inicia sesión para ver tu billetera. <button onClick={login} className="text-indigo-400">Entrar</button></div>;

  // Cálculos para el modal de enviar
  const livePrice = selectedCoin ? (livePrices[selectedCoin.symbol.toUpperCase()] || 0) : 0;
  const amountEur = parseFloat(sendAmount) * livePrice;
  const isValidAmount = amountEur >= 0.03 && amountEur <= 50;
  const calculatedFeeEur = amountEur <= 5 ? 0.01 : amountEur * 0.025;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        {/* CABECERA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-20 pointer-events-none" />
          <div className="relative z-10">
            <p className="text-sm font-medium text-indigo-300 mb-1 flex items-center gap-2">
              <Coins size={16} /> Balance Total (En Vivo)
            </p>
            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight flex items-center gap-4">
              €{totalEur.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              <span className="flex h-3 w-3 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
              </span>
            </h1>
          </div>
        </motion.div>

        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <h2 className="text-2xl font-bold text-white">Tus Activos</h2>
          <input type="text" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="rounded-xl border border-slate-700 bg-slate-900/60 p-2 text-white w-full md:w-64" />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCoins.map((coin) => {
            const balance = coinBalances[coin.symbol.toUpperCase()] || 0;
            const price = livePrices[coin.symbol.toUpperCase()] || 0;
            const trend = priceTrends[coin.symbol.toUpperCase()] || "same";
            
            return (
              <motion.div key={coin.id} whileHover={{ y: -4 }} onClick={() => setSelectedCoin(coin)} className={`rounded-2xl glass p-5 cursor-pointer transition ${balance > 0 ? 'border-indigo-500/40 shadow-[0_0_15px_rgba(99,102,241,0.1)]' : ''}`}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3"><img src={coin.image} className="h-10 w-10 rounded-full" /><div><h3 className="font-semibold text-white">{coin.name}</h3><span className="text-xs text-slate-400">{coin.symbol}</span></div></div>
                  <div className="text-right">
                    <motion.div key={price} initial={{ color: trend === "up" ? "#34d399" : trend === "down" ? "#f87171" : "#ffffff" }} animate={{ color: "#ffffff" }} transition={{ duration: 0.5 }} className="text-white font-medium">
                      €{price.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 6 })}
                    </motion.div>
                  </div>
                </div>
                <div className="flex justify-between border-t border-slate-800 pt-3 text-sm"><span className="text-slate-400">Tu saldo</span><span className={balance > 0 ? 'text-indigo-400 font-semibold' : 'text-white'}>{balance.toFixed(4)} {coin.symbol}</span></div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* MODAL SELECCIÓN */}
      <AnimatePresence>
        {selectedCoin && !modalType && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setSelectedCoin(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6">
              <h3 className="text-xl font-bold text-white mb-6">{selectedCoin.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleOpenReceive(selectedCoin)} className="bg-slate-800 p-4 rounded-xl text-white flex flex-col items-center gap-2">{isGeneratingAddress ? <Loader2 className="animate-spin" /> : <ArrowDownLeft className="text-emerald-400" />}Recibir</button>
                <button onClick={() => handleOpenSend(selectedCoin)} disabled={(coinBalances[selectedCoin.symbol.toUpperCase()] || 0) <= 0} className={`p-4 rounded-xl flex flex-col items-center gap-2 ${(coinBalances[selectedCoin.symbol.toUpperCase()] || 0) > 0 ? 'bg-slate-800 text-white' : 'bg-slate-800/50 text-slate-500'}`}><ArrowUpRight />Enviar</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL RECIBIR */}
      <AnimatePresence>
        {modalType === "receive" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-slate-900 p-8 rounded-3xl text-center relative">
              <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-white"><X /></button>
              <h3 className="text-2xl font-bold text-white mb-4">Recibir {selectedCoin.name}</h3>
              <div className="bg-white p-4 inline-block rounded-xl mb-4"><QRCodeSVG value={depositAddresses[selectedCoin.symbol] || ""} size={200} /></div>
              <div className="bg-slate-800 p-4 rounded-xl flex justify-between items-center">
                <span className="text-sm font-mono text-slate-300 truncate">{depositAddresses[selectedCoin.symbol]}</span>
                <button onClick={() => { navigator.clipboard.writeText(depositAddresses[selectedCoin.symbol]); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="text-indigo-400">{copied ? <CheckCircle2 className="text-emerald-400" /> : <Copy />}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL ENVIAR */}
      <AnimatePresence>
        {modalType === "send" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setModalType(null)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-md bg-slate-900 p-8 rounded-3xl relative">
              <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-white"><X /></button>
              <h3 className="text-2xl font-bold text-white mb-4">Enviar {selectedCoin.symbol}</h3>
              
              <form onSubmit={handleSend} className="space-y-4">
                <input type="text" placeholder="Dirección de destino" value={sendAddress} onChange={e => setSendAddress(e.target.value)} required className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700" />
                
                <div>
                  <div className="relative">
                    <input type="number" step="any" placeholder="Cantidad (ej. 0.0005)" value={sendAmount} onChange={e => setSendAmount(e.target.value)} required className="w-full p-3 rounded-xl bg-slate-800 text-white border border-slate-700 pr-20" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">{selectedCoin.symbol}</span>
                  </div>
                  {/* Valor en vivo en EUR */}
                  {sendAmount && (
                    <p className="text-xs text-slate-400 mt-2 text-right">
                      ≈ €{amountEur.toFixed(3)} EUR
                    </p>
                  )}
                </div>

                {/* Aviso de límites y comisiones */}
                <div className="bg-slate-800/50 p-3 rounded-xl border border-slate-700 text-xs space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-400">Límites permitidos:</span>
                    <span className={amountEur > 50 || amountEur < 0.03 ? "text-red-400 font-bold" : "text-emerald-400"}>
                      0.03€ - 50€
                    </span>
                  </div>
                  {sendAmount && (
                    <div className="flex justify-between items-center">
                      <span className="text-slate-400">Comisión de envío:</span>
                      <span className="text-white">€{calculatedFeeEur.toFixed(3)}</span>
                    </div>
                  )}
                </div>
                
                {sendError && <div className="p-3 bg-red-500/10 text-red-400 text-xs rounded-lg flex items-center gap-2"><AlertCircle size={14} className="flex-shrink-0" />{sendError}</div>}
                {sendSuccess && <div className="p-3 bg-emerald-500/10 text-emerald-400 text-xs rounded-lg flex flex-col gap-2"><div className="flex items-center gap-2"><CheckCircle2 size={14} />{sendSuccess}</div>{explorerUrl && <a href={explorerUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 underline">Ver en Blockchair <ExternalLink size={12} /></a>}</div>}

                <button 
                  type="submit" 
                  disabled={isSending || !isValidAmount || amountEur > (coinBalances[selectedCoin.symbol.toUpperCase()] * livePrice)} 
                  className="w-full bg-indigo-500 p-3 rounded-xl text-white font-bold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSending ? <Loader2 className="animate-spin" /> : <Send />} 
                  Confirmar Envío
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
