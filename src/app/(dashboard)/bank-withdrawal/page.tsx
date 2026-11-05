"use client";

import { useState, useEffect } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "@/components/motion-client";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { 
  Landmark, Loader2, AlertCircle, CheckCircle2, 
  Info, Wallet, ArrowRight, ShieldCheck
} from "lucide-react";

interface Coin { 
  id: string; 
  symbol: string; 
  name: string; 
  image: string; 
  current_price: number;
}

export default function BankWithdrawalPage() {
  const { ready } = usePrivy();
  
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [amount, setAmount] = useState("");
  const [iban, setIban] = useState("");
  const [bic, setBic] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [kycUrl, setKycUrl] = useState<string | null>(null);

  const uid = auth.currentUser?.uid || "";

  // Cargar precios y saldos (igual que antes)
  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch("https://api.coingecko.com/api/v3/coins/markets?vs_currency=eur&order=market_cap_desc&per_page=100&page=1&sparkline=false");
        const data = await res.json();
        setCoins(data);
        const prices: Record<string, number> = {};
        data.forEach((c: Coin) => { prices[c.symbol.toUpperCase()] = c.current_price; });
        setLivePrices(prices);
      } catch (error) { console.error("Error fetching coins:", error); }
    }
    fetchCoins();
  }, []);

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(collection(db, "users", uid, "balances"), (snapshot) => {
      const balances: Record<string, number> = {};
      snapshot.forEach((doc) => { if (doc.data().amount) balances[doc.id] = doc.data().amount; });
      setCoinBalances(balances);
    });
    return () => unsubscribe();
  }, [uid]);

  const selectedPrice = selectedCoin ? (livePrices[selectedCoin.symbol.toUpperCase()] || 0) : 0;
  const amountEur = parseFloat(amount) || 0;
  const currentBalance = selectedCoin ? (coinBalances[selectedCoin.symbol.toUpperCase()] || 0) : 0;
  const currentBalanceEur = currentBalance * selectedPrice;

  const isValidAmount = amountEur >= 0.10 && amountEur <= 300;
  const hasEnoughBalance = amountEur <= currentBalanceEur;
  const canSubmit = selectedCoin && amount && iban && bic && beneficiaryName && isValidAmount && hasEnoughBalance;

  const handleWithdraw = async () => {
    if (!canSubmit) return;
    
    setIsProcessing(true);
    setError(null);
    setSuccess(null);
    setKycUrl(null);

    try {
      const res = await fetch('/api/withdraw-striga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          symbol: selectedCoin.symbol.toUpperCase(),
          amountEur: amountEur,
          iban: iban.replace(/\s+/g, '').toUpperCase(),
          bic: bic.toUpperCase(),
          beneficiaryName: beneficiaryName,
        }),
      });

      const data = await res.json();
      
      if (!res.ok) {
        // Si el backend dice que se requiere KYC, mostramos el botón
        if (data.error === 'KYC_REQUIRED') {
          setKycUrl(data.kycUrl);
          setError(data.message);
          return;
        }
        throw new Error(data.error || 'Error al procesar el retiro');
      }

      setSuccess(`Retiro iniciado. Striga respondió: ${data.message || 'Pago en proceso.'}`);
      setAmount("");
      setIban("");
      setBic("");
      setBeneficiaryName("");
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar el retiro.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!ready) return <div className="p-10 text-white">Cargando entorno seguro...</div>;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        
        {/* CABECERA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/20 text-indigo-400 mb-6">
            <Landmark size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Retiro por cuenta bancaria</h1>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">Verifica tu identidad una sola vez y retira a tu banco cuando quieras.</p>
        </motion.div>

        {/* FORMULARIO */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-slate-700/50 bg-slate-900/80 p-6 md:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="relative z-10 space-y-6">
            
            {/* 1. Moneda */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Moneda a retirar</label>
              <div className="relative">
                <select 
                  onChange={(e) => setSelectedCoin(coins.find(c => c.id === e.target.value) || null)}
                  value={selectedCoin?.id || ""}
                  className="w-full appearance-none bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="" disabled>Selecciona la moneda...</option>
                  {coins.filter(c => (coinBalances[c.symbol.toUpperCase()] || 0) > 0).map(c => (
                    <option key={c.id} value={c.id}>
                      {c.symbol.toUpperCase()} - {c.name} ({(coinBalances[c.symbol.toUpperCase()] || 0).toFixed(4)})
                    </option>
                  ))}
                </select>
                {selectedCoin ? <img src={selectedCoin.image} className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full" /> : <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"><ArrowRight size={16} className="text-slate-500 rotate-90" /></div>
              </div>
            </div>

            {/* 2. Cantidad */}
            <AnimatePresence>
              {selectedCoin && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Cantidad a retirar (en €)</span>
                    <span className="text-indigo-400 font-medium">Disponible: €{currentBalanceEur.toFixed(2)}</span>
                  </div>
                  <div className="relative">
                    <input type="number" step="any" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} className={`w-full bg-slate-800/80 border rounded-xl p-4 text-white text-lg font-semibold outline-none focus:border-indigo-500 ${(!isValidAmount && amount) || (!hasEnoughBalance && amount) ? 'border-red-500' : 'border-slate-700'}`} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">€</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 3. Datos bancarios */}
            <AnimatePresence>
              {selectedCoin && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">IBAN</label>
                    <input type="text" placeholder="ES91 2100 0418 4502 0005 1332" value={iban} onChange={e => setIban(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-white font-mono text-sm outline-none focus:border-indigo-500 uppercase" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">BIC / SWIFT</label>
                    <input type="text" placeholder="CAIXESBBXXX" value={bic} onChange={e => setBic(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-white font-mono text-sm outline-none focus:border-indigo-500 uppercase" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">Nombre del titular</label>
                    <input type="text" placeholder="Juan Pérez" value={beneficiaryName} onChange={e => setBeneficiaryName(e.target.value)} className="w-full bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Feedback */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-500/10 text-red-400 text-sm rounded-xl flex flex-col gap-3 border border-red-500/20">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={18} /> <p>{error}</p>
                  </div>
                  {kycUrl && (
                    <button onClick={() => window.open(kycUrl, '_blank')} className="flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-lg transition">
                      <ShieldCheck size={16} /> Verificar mi identidad ahora
                    </button>
                  )}
                </motion.div>
              )}
              {success && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-emerald-500/10 text-emerald-400 text-sm rounded-xl flex items-start gap-3 border border-emerald-500/20">
                  <CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" /> <p>{success}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Botón */}
            <button onClick={handleWithdraw} disabled={isProcessing || !canSubmit} className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-cyan-400 p-4 rounded-xl text-white font-bold text-lg shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2">
              {isProcessing ? <><Loader2 className="animate-spin" size={20} /> Procesando...</> : <><Landmark size={20} /> Confirmar Retiro</>}
            </button>

            <div className="mt-6 flex items-start justify-center gap-2 text-xs text-slate-500 text-center">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <p>Al pulsar "Confirmar", si no has verificado tu identidad, se te pedirá hacerlo. Es un proceso único y obligatorio por ley.</p>
            </div>

          </div>
        </motion.div>
      </div>
    </div>
  );
}
