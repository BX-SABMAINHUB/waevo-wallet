"use client";

import { useState, useEffect, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "@/components/motion-client";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { identifyBank } from "iban-bank-identifier"; // 🔥 Nueva librería
import { 
  Landmark, Loader2, AlertCircle, CheckCircle2, 
  Info, Building2, Wallet, ArrowRight
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
  const [bankName, setBankName] = useState<string | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uid = auth.currentUser?.uid || "";

  // 1. Cargar precios reales
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

  // 2. Escuchar saldos
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(collection(db, "users", uid, "balances"), (snapshot) => {
      const balances: Record<string, number> = {};
      snapshot.forEach((doc) => { if (doc.data().amount) balances[doc.id] = doc.data().amount; });
      setCoinBalances(balances);
    });
    return () => unsubscribe();
  }, [uid]);

  // 🔥 3. Validación de IBAN y detección de banco (100% offline y para España)
  const handleIbanChange = (value: string) => {
    setIban(value);
    const cleanIban = value.replace(/\s+/g, '').toUpperCase();
    
    if (cleanIban.length < 15) {
      setBankName(null);
      return;
    }

    try {
      const result = identifyBank(cleanIban);
      if (result.valid && result.bank?.name) {
        setBankName(result.bank.name);
      } else {
        setBankName(null);
      }
    } catch (err) {
      console.error("Error identificando banco:", err);
      setBankName(null);
    }
  };

  // Cálculos de saldo y validaciones
  const selectedPrice = selectedCoin ? (livePrices[selectedCoin.symbol.toUpperCase()] || 0) : 0;
  const amountEur = parseFloat(amount) || 0;
  const currentBalance = selectedCoin ? (coinBalances[selectedCoin.symbol.toUpperCase()] || 0) : 0;
  const currentBalanceEur = currentBalance * selectedPrice;

  const isValidAmount = amountEur >= 0.10 && amountEur <= 300;
  const hasEnoughBalance = amountEur <= currentBalanceEur;
  const isValidIban = bankName !== null;

  const handleWithdraw = async () => {
    if (!selectedCoin || !isValidAmount || !hasEnoughBalance || !isValidIban) return;
    
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch('/api/withdraw-striga', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          symbol: selectedCoin.symbol.toUpperCase(),
          amountEur: amountEur,
          iban: iban.replace(/\s+/g, '').toUpperCase(),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar el retiro');

      setSuccess(`Retiro iniciado con éxito. Recibirás ${amountEur.toFixed(2)} € en tu cuenta bancaria en 1-2 días hábiles.`);
      setAmount("");
      setIban("");
      setBankName(null);
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
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/20 text-indigo-400 mb-6">
            <Landmark size={32} />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 tracking-tight">Retiro por cuenta bancaria</h1>
          <p className="text-slate-400 text-sm max-w-lg mx-auto">Convierte tus criptomonedas a euros y recíbelos directamente en tu cuenta bancaria vía SEPA.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-slate-700/50 bg-slate-900/80 p-6 md:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500 rounded-full blur-[100px] opacity-10 pointer-events-none" />
          <div className="relative z-10 space-y-6">
            
            {/* Selección de Moneda */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Moneda a retirar</label>
              <div className="relative">
                <select 
                  onChange={(e) => setSelectedCoin(coins.find(c => c.id === e.target.value) || null)}
                  value={selectedCoin?.id || ""}
                  className="w-full appearance-none bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 cursor-pointer"
                >
                  <option value="" disabled>Selecciona la moneda que quieres vender...</option>
                  {coins.filter(c => (coinBalances[c.symbol.toUpperCase()] || 0) > 0).map(c => (
                    <option key={c.id} value={c.id}>{c.symbol.toUpperCase()} - {c.name} ({(coinBalances[c.symbol.toUpperCase()] || 0).toFixed(4)})</option>
                  ))}
                </select>
                {selectedCoin ? <img src={selectedCoin.image} className="absolute left-4 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full" /> : <Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />}
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"><ArrowRight size={16} className="text-slate-500 rotate-90" /></div>
              </div>
            </div>

            {/* Cantidad en Euros */}
            <AnimatePresence>
              {selectedCoin && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <div className="flex justify-between text-xs text-slate-400 mb-2">
                    <span>Cantidad a retirar (en €)</span>
                    <span className="text-indigo-400 font-medium">Disponible: €{currentBalanceEur.toFixed(2)}</span>
                  </div>
                  <div className="relative">
                    <input 
                      type="number" step="any" placeholder="0.00" value={amount}
                      onChange={e => setAmount(e.target.value)}
                      className={`w-full bg-slate-800/80 border rounded-xl p-4 text-white text-lg font-semibold outline-none focus:border-indigo-500 ${(!isValidAmount && amount) || (!hasEnoughBalance && amount) ? 'border-red-500' : 'border-slate-700'}`}
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xl">€</span>
                  </div>
                  {!isValidAmount && amount && <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertCircle size={12} /> El límite es de 0.10 € a 300 €.</p>}
                  {!hasEnoughBalance && amount && isValidAmount && <p className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertCircle size={12} /> Saldo insuficiente. Tienes €{currentBalanceEur.toFixed(2)}.</p>}
                </motion.div>
              )}
            </AnimatePresence>

            {/* IBAN y Detección de Banco */}
            <AnimatePresence>
              {selectedCoin && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                  <label className="block text-sm font-medium text-slate-300 mb-2 mt-4">IBAN de tu cuenta bancaria</label>
                  <div className="relative">
                    <input 
                      type="text" placeholder="ES91 2100 0418 4502 0005 1332" value={iban}
                      onChange={e => handleIbanChange(e.target.value)}
                      className={`w-full bg-slate-800/80 border rounded-xl p-4 text-white font-mono text-sm outline-none focus:border-indigo-500 uppercase ${!isValidIban && iban ? 'border-red-500' : 'border-slate-700'}`}
                    />
                  </div>
                  <AnimatePresence>
                    {bankName && (
                      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex items-center gap-2 text-emerald-400 text-sm bg-emerald-500/10 p-3 rounded-lg border border-emerald-500/20">
                        <Building2 size={16} />
                        <span>Banco detectado: <strong>{bankName}</strong></span>
                      </motion.div>
                    )}
                    {!isValidIban && iban && iban.replace(/\s+/g, '').length > 15 && (
                      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400 mt-2 flex items-center gap-1"><AlertCircle size={12} /> IBAN no válido o banco no identificado.</motion.p>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Feedback */}
            <AnimatePresence>
              {error && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-red-500/10 text-red-400 text-sm rounded-xl flex items-start gap-3 border border-red-500/20"><AlertCircle size={18} className="flex-shrink-0 mt-0.5" /><p>{error}</p></motion.div>}
              {success && <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="p-4 bg-emerald-500/10 text-emerald-400 text-sm rounded-xl flex items-start gap-3 border border-emerald-500/20"><CheckCircle2 size={18} className="flex-shrink-0 mt-0.5" /><p>{success}</p></motion.div>}
            </AnimatePresence>

            {/* Botón de Confirmar */}
            <button
              onClick={handleWithdraw}
              disabled={isProcessing || !selectedCoin || !isValidAmount || !hasEnoughBalance || !isValidIban}
              className="w-full mt-6 bg-gradient-to-r from-indigo-500 to-cyan-400 p-4 rounded-xl text-white font-bold text-lg shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
            >
              {isProcessing ? <><Loader2 className="animate-spin" size={20} /> Procesando retiro...</> : <><Landmark size={20} /> Confirmar Retiro a mi Banco</>}
            </button>

            <div className="mt-6 flex items-start justify-center gap-2 text-xs text-slate-500 text-center">
              <Info size={14} className="mt-0.5 flex-shrink-0" />
              <p>Los retiros se procesan vía transferencia SEPA. El dinero llegará a tu cuenta en 1-2 días hábiles.</p>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
