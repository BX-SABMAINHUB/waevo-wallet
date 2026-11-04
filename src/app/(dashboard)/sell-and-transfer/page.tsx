"use client";

import { useState, useEffect, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { motion } from "@/components/motion-client";
import { collection, onSnapshot } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { 
  ArrowRightLeft, Loader2, AlertCircle, CheckCircle2, 
  Landmark, Info, Coins 
} from "lucide-react";
import { RampInstantSDK } from "@ramp-network/ramp-instant-sdk";

interface Coin { id: string; symbol: string; name: string; image: string; }

export default function SellAndTransferPage() {
  const { ready } = usePrivy();
  const [coins, setCoins] = useState<Coin[]>([]);
  const [coinBalances, setCoinBalances] = useState<Record<string, number>>({});
  const [livePrices, setLivePrices] = useState<Record<string, number>>({});
  
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [amount, setAmount] = useState("");
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const uid = auth.currentUser?.uid || "";

  // Cargar precios reales
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

  // Escuchar saldos
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

  // Validaciones de límites (0.10€ - 300€) y saldo
  const isValidAmount = amountEur >= 0.10 && amountEur <= 300;
  const hasEnoughBalance = amountEur <= currentBalanceEur;

  // Comisión estimada de Ramp Network (ejemplo ~1.5% para SEPA)
  // La comisión real se muestra dentro del widget de Ramp
  const estimatedRampFee = amountEur * 0.015; 
  const netAmount = amountEur - estimatedRampFee;

  const handleSell = () => {
    if (!selectedCoin || !isValidAmount || !hasEnoughBalance) return;
    setIsProcessing(true);
    setError(null);
    setSuccess(null);

    try {
      // Inicializar el widget de Ramp Network para Off-Ramp
      const ramp = new RampInstantSDK({
        hostAppName: "Waevo Wallet",
        hostLogoUrl: "https://waevo-wallet.vercel.app/logo.png", // Reemplaza con tu logo real
        hostApiKey: process.env.NEXT_PUBLIC_RAMP_HOST_API_KEY!, // Tu clave de API de Ramp
        enabledFlows: ["OFFRAMP"],
        offrampAsset: selectedCoin.symbol.toUpperCase(),
        fiatValue: amountEur,
        fiatCurrency: "EUR",
        userEmailAddress: auth.currentUser?.email || "",
        // Opcional: Puedes añadir un hostFee aquí si Ramp lo permite en tu configuración
      });

      ramp.show();
      setSuccess("Ventana de Ramp Network abierta. Sigue los pasos para completar la venta.");
    } catch (err: any) {
      setError(err.message || "No se pudo abrir el widget de Ramp Network.");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-emerald-500/20 text-emerald-400 mb-6">
            <Landmark size={32} />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center justify-center gap-3">
            Vender y Transferir
          </h1>
          <p className="text-slate-400 text-sm">Convierte tus criptomonedas a euros y recíbelos en tu cuenta bancaria.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="rounded-3xl border border-slate-700 bg-slate-900/80 p-6 md:p-8 backdrop-blur-xl shadow-2xl">
          
          {/* Selección de Moneda */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-slate-400 mb-2">Moneda que quieres vender</label>
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
            {coins.filter(c => (coinBalances[c.symbol.toUpperCase()] || 0) > 0).length === 0 && (
              <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
                <AlertCircle size={12} /> No tienes saldo en ninguna moneda para vender.
              </p>
            )}
          </div>

          {/* Cantidad en Euros */}
          {selectedCoin && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Cantidad a vender (en €)</span>
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

          {/* Resumen de Comisiones */}
          {amount && isValidAmount && hasEnoughBalance && (
            <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 text-sm space-y-2 mb-6">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Cantidad a vender:</span>
                <span className="text-white font-semibold">€{amountEur.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Comisión estimada de Ramp Network:</span>
                <span className="text-white">~€{estimatedRampFee.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                <span className="text-slate-300 font-medium">Recibirás aproximadamente:</span>
                <span className="text-emerald-400 font-bold text-lg">€{netAmount.toFixed(2)}</span>
              </div>
              <p className="text-[10px] text-slate-500 mt-1">La comisión final se mostrará dentro del widget de Ramp Network antes de confirmar.</p>
            </div>
          )}

          {/* Feedback */}
          {error && <div className="p-3 mb-4 bg-red-500/10 text-red-400 text-sm rounded-lg flex items-center gap-2"><AlertCircle size={16} />{error}</div>}
          {success && <div className="p-3 mb-4 bg-emerald-500/10 text-emerald-400 text-sm rounded-lg flex items-center gap-2"><CheckCircle2 size={16} />{success}</div>}

          {/* Botón de Continuar */}
          <button
            onClick={handleSell}
            disabled={isProcessing || !selectedCoin || !isValidAmount || !hasEnoughBalance}
            className="w-full bg-gradient-to-r from-emerald-500 to-teal-400 p-4 rounded-xl text-white font-bold text-lg shadow-lg shadow-emerald-500/25 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
            {isProcessing ? "Abriendo Ramp Network..." : "Continuar con la Venta"}
          </button>

          {/* Nota al pie */}
          <div className="mt-6 flex items-start justify-center gap-2 text-xs text-slate-500">
            <Info size={14} className="mt-0.5 flex-shrink-0" />
            <p className="text-center">
              Para retirar y enviar criptomonedas a otra billetera, utiliza la sección <strong>“Tu Billetera”</strong>.
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
