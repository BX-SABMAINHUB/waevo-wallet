"use client";

import { useState, useEffect, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion } from "@/components/motion-client";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { 
  Landmark, Loader2, AlertCircle, CheckCircle2, 
  Search, Info, Building2
} from "lucide-react";

interface Coin { id: string; symbol: string; name: string; image: string; }

export default function BankWithdrawalPage() {
  const { ready } = usePrivy();
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [amount, setAmount] = useState("");
  const [iban, setIban] = useState("");
  const [bankName, setBankName] = useState<string | null>(null);
  const [isValidatingIban, setIsValidatingIban] = useState(false);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uid = auth.currentUser?.uid || "";

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

  // Validación de IBAN y detección de banco con OpenIBAN
  const validateIban = async (value: string) => {
    setIban(value);
    if (value.length < 15) { setBankName(null); return; }
    
    setIsValidatingIban(true);
    setBankName(null);
    try {
      const res = await fetch(`https://openiban.com/validate/${value}?getBIC=true`);
      const data = await res.json();
      if (data.valid) {
        setBankName(data.bankData?.name || "Banco no identificado");
      } else {
        setBankName(null);
      }
    } catch (error) {
      console.error("Error validando IBAN:", error);
    } finally {
      setIsValidatingIban(false);
    }
  };

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
      const res = await fetch('/api/withdraw-bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: uid,
          symbol: selectedCoin.symbol.toUpperCase(),
          amountEur: amountEur,
          iban: iban,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al procesar el retiro');

      setSuccess("Retiro iniciado. Abriendo la pasarela de pago...");
      // Abrir el widget de Transak en una nueva ventana
      window.open(data.widgetUrl, "_blank", "width=500,height=700");
      
      // Limpiar campos
      setAmount("");
      setIban("");
      setBankName(null);
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar el retiro.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/20 text-indigo-400 mb-6">
            <Landmark size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Retiro por cuenta bancaria</h1>
          <p className="text-slate-400 text-sm">Convierte tus criptomonedas a euros y recíbelos en tu banco.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
          
          {/* Selección de Moneda */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-400 mb-2">Moneda a retirar</label>
            <select 
              onChange={(e) => setSelectedCoin(coins.find(c => c.id === e.target.value) || null)}
              value={selectedCoin?.id || ""}
              className="w-full appearance-none bg-slate-800 border border-slate-700 rounded-xl p-4 text-white outline-none focus:border-indigo-500 cursor-pointer"
            >
              <option value="" disabled>Selecciona una moneda...</option>
              {coins.filter(c => (coinBalances[c.symbol.toUpperCase()] || 0) > 0).map(c => (
                <option key={c.id} value={c.id}>
                  {c.symbol.toUpperCase()} - {c.name} ({(coinBalances[c.symbol.toUpperCase()] || 0).toFixed(4)})
                </option>
              ))}
            </select>
          </div>

          {/* Cantidad en Euros */}
          {selectedCoin && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Cantidad a retirar (en €)</span>
                <span>Disponible: €{currentBalanceEur.toFixed(2)}</span>
              </div>
              <div className="relative">
                <input 
                  type="number" 
                  step="any" 
                  placeholder="0.00" 
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  className={`w-full bg-slate-800 border rounded-xl p-4 text-white outline-none focus:border-indigo-500 ${!isValidAmount && amount ? 'border-red-500' : 'border-slate-700'}`}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">€</span>
              </div>
              {!isValidAmount && amount && (
                <p className="text-xs text-red-400 mt-1">El mínimo es 0.10 € y el máximo 300 €.</p>
              )}
              {!hasEnoughBalance && amount && isValidAmount && (
                <p className="text-xs text-red-400 mt-1">No tienes saldo suficiente en {selectedCoin.symbol} para esta cantidad.</p>
              )}
            </div>
          )}

          {/* IBAN y detección de banco */}
          {selectedCoin && (
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-400 mb-2">IBAN de tu cuenta bancaria</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="ES91 2100 0418 4502 0005 1332" 
                  value={iban}
                  onChange={e => validateIban(e.target.value)}
                  className={`w-full bg-slate-800 border rounded-xl p-4 text-white outline-none focus:border-indigo-500 ${!isValidIban && iban ? 'border-red-500' : 'border-slate-700'}`}
                />
                {isValidatingIban && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 animate-spin text-slate-400" size={20} />}
              </div>
              {bankName && (
                <div className="mt-2 flex items-center gap-2 text-emerald-400 text-sm">
                  <Building2 size={16} />
                  <span>Banco detectado: <strong>{bankName}</strong></span>
                </div>
              )}
              {!isValidIban && iban && !isValidatingIban && (
                <p className="text-xs text-red-400 mt-1">IBAN no válido o banco no identificado.</p>
              )}
            </div>
          )}

          {/* Feedback */}
          {error && <div className="p-3 mb-4 bg-red-500/10 text-red-400 text-sm rounded-lg flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
          {success && <div className="p-3 mb-4 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg flex items-center gap-2"><CheckCircle2 size={16} />{success}</div>}

          {/* Botón de Confirmar */}
          <button
            onClick={handleWithdraw}
            disabled={isProcessing || !selectedCoin || !isValidAmount || !hasEnoughBalance || !isValidIban}
            className="w-full bg-gradient-to-r from-indigo-500 to-cyan-400 p-4 rounded-xl text-white font-bold text-lg shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <Landmark />}
            {isProcessing ? "Procesando retiro..." : "Confirmar Retiro"}
          </button>

          <div className="mt-6 flex items-start justify-center gap-2 text-xs text-slate-500">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            <p className="text-center">
              El retiro se procesará a través de Transak. Recibirás los euros en tu cuenta bancaria en 1-2 días hábiles.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
