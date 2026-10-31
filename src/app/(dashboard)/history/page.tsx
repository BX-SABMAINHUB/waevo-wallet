"use client";

import { useState, useEffect } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "@/components/motion-client";
import { History, RefreshCw, CheckCircle2, Clock, Wallet, Loader2, AlertCircle } from "lucide-react";

interface Deposit {
  symbol: string;
  amount: string;
  hash: string;
  status: 'pending' | 'confirmed';
  confirmations: number;
  timestamp: number;
}

export default function HistoryPage() {
  const { ready } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const userAddress = embeddedWallet?.address || '';

  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [selectedSymbol, setSelectedSymbol] = useState('LTC'); // Moneda por defecto
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});

  const availableSymbols = ['LTC', 'BTC', 'ETH', 'DOGE', 'SOL', 'USDT'];

  const handleCheckDeposits = async () => {
    if (!embeddedWallet) return;
    setChecking(true);
    setChecked(true);
    try {
      let address = depositAddresses[selectedSymbol];

      // Si no tenemos la dirección, la generamos
      if (!address) {
        const genRes = await fetch('/api/generate-address', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: selectedSymbol }),
        });
        const genData = await genRes.json();
        if (!genData.address) throw new Error('No se pudo generar dirección');
        address = genData.address;
        setDepositAddresses(prev => ({ ...prev, [selectedSymbol]: address }));
      }

      // Consultamos los depósitos
      const res = await fetch('/api/check-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: selectedSymbol, address }),
      });
      const data = await res.json();
      setDeposits(data.deposits || []);
    } catch (err) {
      console.error('Error verificando:', err);
    } finally {
      setChecking(false);
    }
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Ingresos y Historial</h1>
          <p className="text-slate-400 text-sm">Verifica si has recibido fondos y revisa tus pagos.</p>
        </motion.div>

        {/* Selector de moneda y botón */}
        <div className="mb-8 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <select
            value={selectedSymbol}
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white outline-none focus:border-indigo-500"
          >
            {availableSymbols.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

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

        {/* Resultados */}
        <AnimatePresence>
          {deposits.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3">
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
                      <p className="font-semibold text-white">Recibiendo {d.amount} {d.symbol}</p>
                      <p className="text-xs text-slate-400">
                        {d.status === 'confirmed' ? 'Confirmado' : `Pendiente (${d.confirmations} confirmaciones)`}
                      </p>
                    </div>
                  </div>
                  <a href={`https://blockchair.com/litecoin/transaction/${d.hash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-400 hover:underline">
                    Ver tx
                  </a>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
