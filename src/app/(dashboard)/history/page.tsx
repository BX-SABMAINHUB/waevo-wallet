"use client";

import { useState, useEffect, useRef } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "@/components/motion-client";
import { auth } from "@/lib/firebase";
import { 
  RefreshCw, CheckCircle2, Clock, Wallet, Loader2, 
  AlertCircle, Search, ChevronDown, ExternalLink, 
  ArrowDownLeft, ShieldCheck, Zap, Activity, Copy, X,
  TrendingUp
} from "lucide-react";

interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
}

interface Deposit {
  symbol: string;
  amount: string;
  hash: string;
  status: 'pending' | 'confirmed';
  confirmations: number;
  timestamp: number;
}

// Configuración de tiempos por red para estimar el tiempo restante
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
  const [balance, setBalance] = useState<string>('0');
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);

  // Estados para el Modal
  const [selectedTx, setSelectedTx] = useState<Deposit | null>(null);
  const [isTxModalOpen, setIsTxModalOpen] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // 1. Cargar monedas
  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page=1&sparkline=false"
        );
        const data = await res.json();
        setCoins(data);
      } catch (error) {
        console.error("Error fetching coins:", error);
      }
    }
    fetchCoins();
  }, []);

  // 2. Polling automático cada 15s si el modal está abierto y hay transacciones pendientes
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isTxModalOpen && selectedTx && selectedTx.status === 'pending') {
      interval = setInterval(() => {
        fetchDeposits();
      }, 15000); 
    }
    return () => clearInterval(interval);
  }, [isTxModalOpen, selectedTx]);

  // 3. Generar dirección (misma lógica que antes)
  const handleSelectCoin = async (coin: Coin) => {
    setSelectedCoin(coin);
    setIsDropdownOpen(false);
    setSearch("");
    setDeposits([]);
    setChecked(false);
    setBalance('0');

    if (depositAddresses[coin.id] || !uid) return;

    setIsGeneratingAddress(true);
    try {
      const xpubKey = `waevo_xpub_${coin.symbol.toUpperCase()}`;
      const savedXpub = localStorage.getItem(xpubKey);

      const res = await fetch('/api/generate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: coin.symbol, userId: uid, xpub: savedXpub }),
      });
      const data = await res.json();
      if (data.address) {
        if (data.xpub) localStorage.setItem(xpubKey, data.xpub);
        setDepositAddresses(prev => ({ ...prev, [coin.id]: data.address }));
      }
    } catch (error) {
      console.error("Error generando dirección:", error);
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  // 4. Consultar depósitos y saldo real
  const fetchDeposits = async () => {
    if (!selectedCoin || !depositAddresses[selectedCoin.id]) return;
    
    setChecking(true);
    try {
      const res = await fetch('/api/check-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          symbol: selectedCoin.symbol, 
          address: depositAddresses[selectedCoin.id] 
        }),
      });
      const data = await res.json();
      
      setDeposits(data.deposits || []);
      setBalance(data.balance || '0'); // Actualizamos el saldo real

      // Si el modal está abierto, actualizamos la transacción seleccionada
      if (selectedTx && data.deposits) {
        const updatedTx = data.deposits.find((d: Deposit) => d.hash === selectedTx.hash);
        if (updatedTx) setSelectedTx(updatedTx);
      }
    } catch (err) {
      console.error('Error verificando:', err);
    } finally {
      setChecking(false);
      setChecked(true);
    }
  };

  const handleCheckDeposits = () => {
    setDeposits([]);
    fetchDeposits();
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // 5. Calcular progreso para el modal
  const getTxDetails = (tx: Deposit) => {
    const symbol = tx.symbol.toUpperCase();
    const config = NETWORK_CONFIG[symbol] || NETWORK_CONFIG.DEFAULT;
    
    const currentConf = tx.confirmations || 0;
    const requiredConf = config.requiredConf;
    const progressPercentage = Math.min((currentConf / requiredConf) * 100, 100);
    
    const remainingConf = Math.max(requiredConf - currentConf, 0);
    const estTimeMins = remainingConf * config.blockTimeMins;
    
    let timeString = "";
    if (estTimeMins >= 60) {
      timeString = `~${(estTimeMins / 60).toFixed(1)} horas`;
    } else if (estTimeMins > 0) {
      timeString = `~${estTimeMins.toFixed(0)} minutos`;
    } else {
      timeString = "Completado";
    }

    return { progressPercentage, timeString, remainingConf, requiredConf, currentConf };
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

  const currentAddress = selectedCoin ? depositAddresses[selectedCoin.id] : null;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10 relative overflow-hidden">
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.1, 0.2, 0.1] }} 
        transition={{ duration: 8, repeat: Infinity }}
        className="absolute top-0 right-0 w-96 h-96 bg-indigo-500 rounded-full blur-[100px] pointer-events-none"
      />

      <div className="mx-auto max-w-5xl relative z-10">
        
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Ingresos y Historial</h1>
            <p className="text-slate-400 text-sm">Datos en tiempo real desde Blockchair.</p>
          </div>
          {/* Saldo real actualizado */}
          {selectedCoin && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
              <div className="h-10 w-10 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                <TrendingUp size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-400">Saldo Confirmado</p>
                <p className="text-xl font-bold text-white">
                  {balance} {selectedCoin.symbol.toUpperCase()}
                </p>
              </div>
            </div>
          )}
        </motion.div>

        {/* Panel de control (selector y botón) - idéntico al anterior */}
        <div className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-xl shadow-2xl">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div className="relative w-full md:w-80" ref={dropdownRef}>
              <div 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center justify-between w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white cursor-pointer hover:border-indigo-500 transition-all"
              >
                <div className="flex items-center gap-2 truncate">
                  {selectedCoin ? (
                    <>
                      <img src={selectedCoin.image} alt={selectedCoin.name} className="h-5 w-5 rounded-full" />
                      <span>{selectedCoin.name} ({selectedCoin.symbol.toUpperCase()})</span>
                    </>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-2">
                      <Search size={16} /> Selecciona una moneda...
                    </span>
                  )}
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    className="absolute z-50 mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 shadow-2xl overflow-hidden"
                  >
                    <div className="p-2 border-b border-slate-700">
                      <input type="text" autoFocus placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full bg-transparent text-sm text-white outline-none px-2 py-1" />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {coins.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.symbol.toLowerCase().includes(search.toLowerCase())).map((coin) => (
                        <div key={coin.id} onClick={() => handleSelectCoin(coin)} className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700">
                          <img src={coin.image} alt={coin.name} className="h-6 w-6 rounded-full" />
                          <div><p className="text-sm font-medium text-white">{coin.name}</p><p className="text-xs text-slate-400">{coin.symbol.toUpperCase()}</p></div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={handleCheckDeposits}
              disabled={!selectedCoin || isGeneratingAddress || checking}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-50 w-full md:w-auto"
            >
              {checking ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
              {checking ? 'Verificando...' : 'Verificar ingresos'}
            </button>
          </div>

          {selectedCoin && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <Wallet size={14} className="text-indigo-400" />
              <span className="truncate">Billetera: <span className="font-mono text-slate-300">{currentAddress}</span></span>
            </div>
          )}
        </div>

        {/* Lista de transacciones */}
        <AnimatePresence>
          {checked && !checking && deposits.length === 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center p-10 bg-slate-900/40 rounded-3xl border border-slate-800">
              <AlertCircle size={32} className="text-slate-500 mb-4" />
              <h3 className="text-lg font-semibold text-white">No se detectaron transacciones</h3>
            </motion.div>
          )}

          {deposits.length > 0 && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
              {deposits.map((d, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                  className="group relative overflow-hidden rounded-2xl bg-slate-900/80 p-5 border border-slate-700 hover:border-indigo-500/50 transition-all cursor-pointer"
                  onClick={() => { setSelectedTx(d); setIsTxModalOpen(true); }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-2xl flex items-center justify-center ${d.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400 animate-pulse'}`}>
                        {d.status === 'confirmed' ? <CheckCircle2 size={24} /> : <Clock size={24} />}
                      </div>
                      <div>
                        <p className="text-lg font-bold text-white flex items-center gap-2">
                          +{d.amount} <span className="text-indigo-400">{d.symbol}</span>
                        </p>
                        <p className="text-sm text-slate-400">
                          {d.status === 'confirmed' ? 'Confirmado en la blockchain' : `${d.confirmations} confirmaciones`}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-indigo-400 group-hover:underline flex items-center gap-1">Ver detalles <ChevronDown size={14} /></span>
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
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
            onClick={() => setIsTxModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, y: 50, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 50, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-[2rem] border border-slate-700/50 bg-gradient-to-b from-slate-900 to-slate-950 p-6 shadow-2xl relative"
            >
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-4">
                  <div className="h-14 w-14 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-400 border border-indigo-500/20">
                    <ArrowDownLeft size={28} />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">Depósito Recibido</h3>
                    <p className="text-sm text-slate-400">Detalles en tiempo real</p>
                  </div>
                </div>
                <button onClick={() => setIsTxModalOpen(false)} className="h-10 w-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white transition">
                  <X size={20} />
                </button>
              </div>

              <div className="text-center mb-8">
                <div className="text-5xl font-extrabold text-white mb-2">
                  +{selectedTx.amount} <span className="text-3xl text-indigo-400">{selectedTx.symbol}</span>
                </div>
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold ${selectedTx.status === 'confirmed' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
                  {selectedTx.status === 'confirmed' ? <ShieldCheck size={14} /> : <Loader2 size={14} className="animate-spin" />}
                  {selectedTx.status === 'confirmed' ? 'Añadido al saldo' : 'Esperando confirmaciones'}
                </div>
              </div>

              {/* Barra de progreso con confirmaciones REALES */}
              {selectedTx.status === 'pending' && (
                <div className="mb-8 bg-slate-900/80 rounded-2xl p-5 border border-slate-800">
                  <div className="flex justify-between text-xs font-medium mb-3">
                    <span className="text-slate-400">Confirmaciones (Blockchair)</span>
                    <span className="text-indigo-400 font-bold">
                      {getTxDetails(selectedTx).currentConf} / {getTxDetails(selectedTx).requiredConf}
                    </span>
                  </div>
                  <div className="h-3 w-full bg-slate-800 rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }} animate={{ width: `${getTxDetails(selectedTx).progressPercentage}%` }} transition={{ duration: 1 }}
                      className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400"
                    />
                  </div>
                  <div className="flex justify-between items-center mt-3">
                    <p className="text-xs text-slate-500 flex items-center gap-1"><Clock size={12} /> Tiempo est.: {getTxDetails(selectedTx).timeString}</p>
                    <button onClick={(e) => { e.stopPropagation(); fetchDeposits(); }} disabled={checking} className="text-xs flex items-center gap-1 text-indigo-400 hover:text-indigo-300">
                      <RefreshCw size={12} className={checking ? "animate-spin" : ""} /> Actualizar
                    </button>
                  </div>
                </div>
              )}

              <div className="space-y-3 bg-slate-900/50 rounded-2xl p-4 border border-slate-800 mb-6">
                <div className="flex justify-between text-sm"><span className="text-slate-400 flex items-center gap-2"><Zap size={14} /> Red</span><span className="text-white">{selectedTx.symbol}</span></div>
                <div className="h-px w-full bg-slate-800" />
                <div className="flex justify-between text-sm"><span className="text-slate-400 flex items-center gap-2"><Activity size={14} /> Hash</span><div className="flex items-center gap-2"><span className="text-slate-300 font-mono text-xs truncate max-w-[120px]">{selectedTx.hash}</span><button onClick={() => copyHash(selectedTx.hash)}>{copiedHash ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} className="text-indigo-400" />}</button></div></div>
              </div>

              <a href={`https://blockchair.com/search?q=${selectedTx.hash}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-sm font-semibold transition">
                Ver en Blockchair <ExternalLink size={16} />
              </a>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
