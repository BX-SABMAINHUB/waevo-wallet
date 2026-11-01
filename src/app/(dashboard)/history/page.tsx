"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "@/components/motion-client";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, increment } from "firebase/firestore";
import { 
  RefreshCw, CheckCircle2, Clock, Wallet, Loader2, 
  AlertCircle, Search, ChevronDown, ExternalLink, 
  ArrowDownLeft, ShieldCheck, Activity, Copy, X, TrendingUp,
  Database, Server, Hash, Gift
} from "lucide-react";

interface Coin { id: string; symbol: string; name: string; image: string; }
interface Deposit { symbol: string; amount: string; hash: string; status: 'pending' | 'confirmed'; confirmations: number; timestamp: number; }

const NETWORK_CONFIG: Record<string, { requiredConf: number, blockTimeMins: number }> = {
  BTC: { requiredConf: 3, blockTimeMins: 10 },
  LTC: { requiredConf: 3, blockTimeMins: 2.5 },
  DOGE: { requiredConf: 6, blockTimeMins: 1 },
  ETH: { requiredConf: 12, blockTimeMins: 0.2 },
  DEFAULT: { requiredConf: 3, blockTimeMins: 5 }
};

export default function HistoryPage() {
  const { ready } = usePrivy();
  const uid = auth.currentUser?.uid || "";

  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);

  const [selectedTx, setSelectedTx] = useState<Deposit | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Estados para Reclamar
  const [claimedTxs, setClaimedTxs] = useState<string[]>([]);
  const [isClaiming, setIsClaiming] = useState(false);

  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false");
        const data = await res.json();
        setCoins(data);
      } catch (error) { console.error("Error fetching coins:", error); }
    }
    fetchCoins();
  }, []);

  // Cargar transacciones ya reclamadas
  useEffect(() => {
    if (!uid) return;
    async function fetchClaimed() {
      try {
        const docRef = doc(db, "users", uid, "claimed_transactions", "history");
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setClaimedTxs(docSnap.data().hashes || []);
        }
      } catch (error) {
        console.error("Error cargando reclamados:", error);
      }
    }
    fetchClaimed();
  }, [uid]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsDropdownOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchDeposits = useCallback(async () => {
    if (!selectedCoin || !depositAddresses[selectedCoin.id]) return;
    setChecking(true);
    try {
      const res = await fetch('/api/check-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedCoin.symbol, address: depositAddresses[selectedCoin.id] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error consultando depósitos');
      
      setDeposits(data.deposits || []);
      
      if (selectedTx && data.deposits) {
        const updatedTx = data.deposits.find((d: Deposit) => d.hash === selectedTx.hash);
        if (updatedTx) setSelectedTx(updatedTx);
      }
    } catch (err) { console.error('Error verificando:', err); }
    finally { setChecking(false); setChecked(true); }
  }, [selectedCoin, depositAddresses, selectedTx]);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTxModalOpen && selectedTx && selectedTx.status === 'pending') {
      interval = setInterval(() => { fetchDeposits(); }, 10000); 
    }
    return () => clearInterval(interval);
  }, [isTxModalOpen, selectedTx, fetchDeposits]);

  const handleSelectCoin = async (coin: Coin) => {
    setSelectedCoin(coin);
    setIsDropdownOpen(false);
    setSearch("");
    setDeposits([]);
    setChecked(false);
    
    if (depositAddresses[coin.id] || !uid) return;
    
    setIsGeneratingAddress(true);
    try {
      const res = await fetch('/api/generate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: coin.symbol, userId: uid }),
      });
      const data = await res.json();
      if (data.address) setDepositAddresses(prev => ({ ...prev, [coin.id]: data.address }));
    } catch (error) { console.error("Error generando dirección:", error); }
    finally { setIsGeneratingAddress(false); }
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // Lógica para reclamar el dinero
  const handleClaim = async () => {
    if (!uid || !selectedTx || !selectedCoin) return;
    setIsClaiming(true);

    try {
      // 1. Sumar el saldo a la billetera en Firestore
      const balanceRef = doc(db, "users", uid, "balances", selectedCoin.symbol.toUpperCase());
      await setDoc(balanceRef, {
        amount: increment(parseFloat(selectedTx.amount))
      }, { merge: true });

      // 2. Guardar el hash como reclamado para que no se pueda volver a reclamar
      const claimedRef = doc(db, "users", uid, "claimed_transactions", "history");
      const newClaimedList = [...claimedTxs, selectedTx.hash];
      await setDoc(claimedRef, { hashes: newClaimedList }, { merge: true });
      
      setClaimedTxs(newClaimedList);
      
      alert(`✅ ¡Has reclamado ${selectedTx.amount} ${selectedTx.symbol}! Ya está disponible en Tu Billetera.`);
      setIsTxModalOpen(false);
    } catch (error) {
      console.error("Error reclamando:", error);
      alert("❌ Error al reclamar el dinero. Inténtalo de nuevo.");
    } finally {
      setIsClaiming(false);
    }
  };

  const getTxDetails = (tx: Deposit) => {
    const symbol = tx.symbol.toUpperCase();
    const config = NETWORK_CONFIG[symbol] || NETWORK_CONFIG.DEFAULT;
    const currentConf = tx.confirmations || 0;
    const requiredConf = config.requiredConf;
    const progressPercentage = Math.min((currentConf / requiredConf) * 100, 100);
    const remainingConf = Math.max(requiredConf - currentConf, 0);
    const estTimeMins = remainingConf * config.blockTimeMins;
    
    let timeString = "";
    if (estTimeMins >= 60) timeString = `~${(estTimeMins / 60).toFixed(1)} horas`;
    else if (estTimeMins > 0) timeString = `~${estTimeMins.toFixed(0)} minutos`;
    else timeString = "Completado";
    
    return { progressPercentage, timeString, remainingConf, requiredConf, currentConf };
  };

  if (!ready) return <div className="p-10 text-center text-white">Cargando...</div>;
  const currentAddress = selectedCoin ? depositAddresses[selectedCoin.id] : null;
  const isCurrentTxClaimed = selectedTx ? claimedTxs.includes(selectedTx.hash) : false;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10 relative overflow-hidden">
      <motion.div animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }} transition={{ duration: 8, repeat: Infinity }} className="absolute top-0 right-0 w-96 h-96 bg-indigo-500 rounded-full blur-[100px] pointer-events-none" />

      <div className="mx-auto max-w-5xl relative z-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Ingresos y Historial</h1>
            <p className="text-slate-400 text-sm">Verifica y reclama tus fondos.</p>
          </div>
        </motion.div>

        <div className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-xl shadow-2xl">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="relative w-full md:w-80" ref={dropdownRef}>
              <div onClick={() => setIsDropdownOpen(!isDropdownOpen)} className="flex items-center justify-between w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white cursor-pointer hover:border-indigo-500 transition-all">
                <div className="flex items-center gap-2 truncate">
                  {selectedCoin ? (<><img src={selectedCoin.image} className="h-5 w-5 rounded-full" /><span>{selectedCoin.name} ({selectedCoin.symbol.toUpperCase()})</span></>) : (<span className="text-slate-400 flex items-center gap-2"><Search size={16} /> Selecciona una moneda...</span>)}
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>
              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="absolute z-50 mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 shadow-2xl overflow-hidden">
                    <div className="p-2 border-b border-slate-700"><input type="text" autoFocus placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm text-white outline-none px-2 py-1" /></div>
                    <div className="max-h-60 overflow-y-auto custom-scrollbar">
                      {coins.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.symbol.toLowerCase().includes(search.toLowerCase())).map((coin) => (
                        <div key={coin.id} onClick={() => handleSelectCoin(coin)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700 transition">
                          <img src={coin.image} className="h-6 w-6 rounded-full" />
                          <div><p className="text-sm font-medium text-white">{coin.name}</p><p className="text-xs text-slate-400">{coin.symbol.toUpperCase()}</p></div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => { setDeposits([]); fetchDeposits(); }} disabled={!selectedCoin || isGeneratingAddress || checking} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-50 w-full md:w-auto">
              {checking ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />} {checking ? 'Verificando...' : 'Verificar ingresos'}
            </button>
          </div>
          {selectedCoin && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <Wallet size={14} className="text-indigo-400" />
              <span className="truncate">{isGeneratingAddress ? "Generando dirección..." : currentAddress ? `Billetera: ${currentAddress}` : "Error al generar dirección"}</span>
            </div>
          )}
        </div>

        <AnimatePresence>
          {checked && !checking && deposits.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center p-10 bg-slate-900/40 rounded-3xl border border-slate-800">
              <div className="h-16 w-16 bg-slate-800 rounded-full flex items-center justify-center mb-4"><AlertCircle size={32} className="text-slate-500" /></div>
              <h3 className="text-lg font-semibold text-white">No se detectaron transacciones</h3>
            </motion.div>
          )}
          {deposits.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2"><Activity size={20} className="text-indigo-400" /> Transacciones Detectadas</h2>
              {deposits.map((d, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }} className="group relative overflow-hidden rounded-2xl bg-slate-900/80 p-5 border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer" onClick={() => { setSelectedTx(d); setIsTxModalOpen(true); }}>
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${d.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400 animate-pulse'}`}>
                        {d.status === 'confirmed' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white flex items-center gap-2">Recibiendo {d.amount} <span className="text-indigo-400">{d.symbol}</span></p>
                        <p className="text-sm text-slate-400">{d.status === 'confirmed' ? 'Confirmado (Reclamar para añadir)' : `${d.confirmations} confirmaciones (Pendiente)`}</p>
                      </div>
                    </div>
                    <span className="text-xs text-indigo-400 font-medium group-hover:underline flex items-center gap-1">Ver detalles <ChevronDown size={14} className="group-hover:translate-y-1 transition-transform" /></span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* MODAL DETALLADO */}
      <AnimatePresence>
        {isTxModalOpen && selectedTx && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4" onClick={() => setIsTxModalOpen(false)}>
            <motion.div initial={{ scale: 0.9, y: 50, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 50, opacity: 0 }} transition={{ type: "spring", damping: 25, stiffness: 300 }} onClick={(e) => e.stopPropagation()} className="w-full max-w-lg rounded-[2rem] border border-slate-700/50 bg-gradient-to-b from-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50" />
              
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.2)]"><ArrowDownLeft size={28} /></div>
                  <div><h3 className="text-2xl font-bold text-white">Detalles del Depósito</h3><p className="text-sm text-slate-400">Información on-chain</p></div>
                </div>
                <button onClick={() => setIsTxModalOpen(false)} className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition"><X size={20} /></button>
              </div>

              <div className="text-center mb-8">
                <div className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 mb-2">+{selectedTx.amount} <span className="text-3xl text-indigo-400">{selectedTx.symbol}</span></div>
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold ${selectedTx.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'}`}>
                  {selectedTx.status === 'confirmed' ? <ShieldCheck size={14} /> : <Loader2 size={14} className="animate-spin" />} {selectedTx.status === 'confirmed' ? 'Confirmado' : 'Esperando Confirmaciones'}
                </div>
              </div>

              {selectedTx.status === 'pending' && (
                <div className="mb-8 bg-slate-900/80 rounded-2xl p-5 border border-slate-800">
                  <div className="flex justify-between text-xs font-medium mb-3"><span className="text-slate-400">Progreso de la red</span><span className="text-indigo-400 font-bold">{getTxDetails(selectedTx).currentConf} / {getTxDetails(selectedTx).requiredConf} confirmaciones</span></div>
                  <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div initial={{ width: 0 }} animate={{ width: `${getTxDetails(selectedTx).progressPercentage}%` }} transition={{ duration: 1 }} className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 relative">
                      <div className="absolute inset-0 bg-white/20 animate-pulse" />
                    </motion.div>
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> Tiempo est.: {getTxDetails(selectedTx).timeString}</p>
                    <button onClick={(e) => { e.stopPropagation(); fetchDeposits(); }} disabled={checking} className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition">
                      <RefreshCw size={12} className={checking ? "animate-spin" : ""} /> Actualizar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-4 bg-slate-900/50 rounded-2xl p-5 border border-slate-800 mb-6">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 flex items-center gap-2"><Server size={14} /> Red</span>
                  <span className="text-white font-medium">{selectedTx.symbol}</span>
                </div>
                <div className="h-px w-full bg-slate-800" />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 flex items-center gap-2"><Database size={14} /> Confirmaciones</span>
                  <span className="text-white font-medium">{selectedTx.confirmations}</span>
                </div>
                <div className="h-px w-full bg-slate-800" />
                <div className="flex justify-between items-center text-sm">
                  <span className="text-slate-400 flex items-center gap-2"><Hash size={14} /> Hash</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-mono text-xs truncate max-w-[120px]">{selectedTx.hash}</span>
                    <button onClick={() => copyHash(selectedTx.hash)} className="text-indigo-400 hover:text-white transition">
                      {copiedHash ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* BOTÓN DE RECLAMAR */}
              {selectedTx.status === 'confirmed' && (
                <div className="mt-6">
                  {isCurrentTxClaimed ? (
                    <div className="w-full py-4 rounded-xl bg-slate-800 text-slate-400 text-sm font-semibold flex items-center justify-center gap-2 border border-slate-700">
                      <CheckCircle2 size={18} /> Dinero ya reclamado
                    </div>
                  ) : (
                    <button 
                      onClick={handleClaim} 
                      disabled={isClaiming}
                      className="w-full py-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 text-white text-lg font-bold shadow-[0_0_20px_rgba(16,185,129,0.3)] transition hover:scale-[1.02] flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isClaiming ? <Loader2 className="animate-spin" size={20} /> : <Gift size={20} />}
                      {isClaiming ? "Reclamando..." : "Reclamar Dinero"}
                    </button>
                  )}
                </div>
              )}

              <a href={`https://blockchair.com/search?q=${selectedTx.hash}`} target="_blank" rel="noopener noreferrer" className="mt-4 flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition group">
                Ver en Blockchair <ExternalLink size={16} className="text-slate-400 group-hover:text-white" />
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
