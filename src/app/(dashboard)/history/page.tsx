"use client";

import { useState, useEffect } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "@/components/motion-client";
import { 
  History, RefreshCw, ArrowDownLeft, ArrowUpRight, 
  CheckCircle2, Clock, Wallet, Loader2, AlertCircle 
} from "lucide-react";
import Link from "next/link";

interface Deposit {
  symbol: string;
  name: string;
  amount: string;
  hash: string;
  status: 'pending' | 'confirmed';
  confirmations: number;
  timestamp: number;
}

interface Payment {
  chain: string;
  hash: string;
  amount: string;
  to: string;
  timestamp: number;
  status: string;
}

export default function HistoryPage() {
  const { ready } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const userAddress = embeddedWallet?.address || '';

  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [checking, setChecking] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [checked, setChecked] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});

  // 1. Cargar historial de pagos al iniciar
  useEffect(() => {
    if (!userAddress) return;
    async function fetchHistory() {
      setLoadingHistory(true);
      try {
        const res = await fetch('/api/transaction-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress }),
        });
        const data = await res.json();
        setPayments(data.history || []);
      } catch (err) {
        console.error('Error cargando historial:', err);
      } finally {
        setLoadingHistory(false);
      }
    }
    fetchHistory();
  }, [userAddress]);

  // 2. Verificar ingresos (botón)
  const handleCheckDeposits = async () => {
    if (!embeddedWallet) return;
    setChecking(true);
    setChecked(true);
    try {
      // Obtener direcciones de las monedas (simulamos una lista de las principales)
      // En producción, podrías obtenerlas de Firestore o del estado global.
      const symbols = ['BTC', 'ETH', 'SOL', 'LTC', 'DOGE', 'USDT', 'MATIC'];
      const walletsToCheck: { symbol: string; address: string }[] = [];

      for (const symbol of symbols) {
        // Si ya tenemos la dirección en caché, la usamos
        if (depositAddresses[symbol]) {
          walletsToCheck.push({ symbol, address: depositAddresses[symbol] });
          continue;
        }
        // Si no, la generamos llamando a la API (esto puede tardar)
        try {
          const res = await fetch('/api/generate-address', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol }),
          });
          const data = await res.json();
          if (data.address) {
            depositAddresses[symbol] = data.address; // guardar en caché local
            walletsToCheck.push({ symbol, address: data.address });
          }
        } catch (err) {
          console.warn(`No se pudo obtener dirección para ${symbol}`, err);
        }
      }
      setDepositAddresses({ ...depositAddresses });

      // Llamar al backend para verificar depósitos
      const res = await fetch('/api/check-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallets: walletsToCheck }),
      });
      const data = await res.json();
      setDeposits(data.deposits || []);
    } catch (err) {
      console.error('Error verificando ingresos:', err);
    } finally {
      setChecking(false);
    }
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        {/* Cabecera con saldo (simplificado) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8"
        >
          <h1 className="text-3xl font-bold text-white mb-2">Ingresos y Historial</h1>
          <p className="text-slate-400 text-sm">
            Verifica si has recibido fondos y revisa tus pagos realizados.
          </p>
        </motion.div>

        {/* Botón Verificar Ingresos */}
        <div className="mb-8 flex items-center gap-4">
          <button
            onClick={handleCheckDeposits}
            disabled={checking}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-60"
          >
            {checking ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
            {checking ? 'Verificando...' : 'Verificar ingresos'}
          </button>
          {checked && !checking && deposits.length === 0 && (
            <span className="text-sm text-slate-400 flex items-center gap-1">
              <AlertCircle size={16} /> No se detectó nada
            </span>
          )}
        </div>

        {/* Resultados de depósitos */}
        <AnimatePresence>
          {deposits.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 space-y-3"
            >
              <h2 className="text-xl font-bold text-white mb-2">Depósitos detectados</h2>
              {deposits.map((d, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-slate-900/60 p-4 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                      d.status === 'confirmed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {d.status === 'confirmed' ? <CheckCircle2 size={20} /> : <Clock size={20} />}
                    </div>
                    <div>
                      <p className="font-semibold text-white">
                        Recibiendo {d.amount} {d.symbol}
                      </p>
                      <p className="text-xs text-slate-400">
                        {d.status === 'confirmed' ? 'Confirmado' : `Pendiente (${d.confirmations} confirmaciones)`}
                      </p>
                    </div>
                  </div>
                  <a
                    href={`https://blockchain explorer...`} // Opcional
                    target="_blank"
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Ver tx
                  </a>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Historial de pagos */}
        <div className="mt-10">
          <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <History size={20} /> Pagos realizados
          </h2>
          {loadingHistory ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-800/50" />
              ))}
            </div>
          ) : payments.length === 0 ? (
            <p className="text-slate-400 text-sm">Aún no has realizado ningún pago.</p>
          ) : (
            <div className="space-y-3">
              {payments.map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-xl bg-slate-900/60 p-4 border border-slate-800">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                      <ArrowUpRight size={20} />
                    </div>
                    <div>
                      <p className="font-semibold text-white">
                        Enviado {p.amount} {p.chain.toUpperCase()}
                      </p>
                      <p className="text-xs text-slate-400 truncate max-w-[200px]">
                        A: {p.to}
                      </p>
                    </div>
                  </div>
                  <span className={`text-xs font-medium ${p.status === 'confirmed' ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {p.status === 'confirmed' ? 'Confirmado' : 'Pendiente'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
