"use client";

import { useState, useEffect, useRef } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { motion, AnimatePresence } from "@/components/motion-client";
import { 
  History, RefreshCw, CheckCircle2, Clock, Wallet, 
  Loader2, AlertCircle, Search, ChevronDown, Coins
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

export default function HistoryPage() {
  const { ready } = usePrivy();
  const { wallets } = useWallets();
  const embeddedWallet = wallets.find(w => w.walletClientType === 'privy');
  const userAddress = embeddedWallet?.address || '';

  // Estados de monedas y búsqueda
  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Estados de verificación
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [checking, setChecking] = useState(false);
  const [checked, setChecked] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);

  // 1. Cargar todas las monedas de CoinGecko
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

  // 2. Cerrar el dropdown si haces clic fuera
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredCoins = coins.filter(
    (coin) =>
      coin.name.toLowerCase().includes(search.toLowerCase()) ||
      coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  // 3. Al seleccionar una moneda, generamos o recuperamos su dirección
  const handleSelectCoin = async (coin: Coin) => {
    setSelectedCoin(coin);
    setIsDropdownOpen(false);
    setSearch("");
    setDeposits([]);
    setChecked(false);

    // Si ya tenemos la dirección en caché, no hacemos nada
    if (depositAddresses[coin.id]) return;

    setIsGeneratingAddress(true);
    try {
      const res = await fetch('/api/generate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: coin.symbol }),
      });
      const data = await res.json();
      if (data.address) {
        setDepositAddresses(prev => ({ ...prev, [coin.id]: data.address }));
      }
    } catch (error) {
      console.error("Error generando dirección:", error);
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  // 4. Verificar ingresos en la dirección seleccionada
  const handleCheckDeposits = async () => {
    if (!selectedCoin || !depositAddresses[selectedCoin.id]) return;
    
    setChecking(true);
    setChecked(true);
    setDeposits([]);

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
    } catch (err) {
      console.error('Error verificando:', err);
    } finally {
      setChecking(false);
    }
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

  const currentAddress = selectedCoin ? depositAddresses[selectedCoin.id] : null;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        
        {/* CABECERA */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">Ingresos y Historial</h1>
          <p className="text-slate-400 text-sm">Selecciona una moneda y verifica si has recibido fondos.</p>
        </motion.div>

        {/* SELECTOR DE MONEDA Y BOTÓN DE VERIFICACIÓN */}
        <div className="mb-8 rounded-3xl border border-slate-800 bg-slate-900/50 p-6 backdrop-blur-xl">
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            
            {/* Buscador de monedas */}
            <div className="relative w-full md:w-80" ref={dropdownRef}>
              <div 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="flex items-center justify-between w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white cursor-pointer hover:border-indigo-500 transition"
              >
                <div className="flex items-center gap-2 truncate">
                  {selectedCoin ? (
                    <>
                      <img src={selectedCoin.image} alt={selectedCoin.name} className="h-5 w-5 rounded-full" />
                      <span>{selectedCoin.name} ({selectedCoin.symbol.toUpperCase()})</span>
                    </>
                  ) : (
                    <span className="text-slate-400 flex items-center gap-2">
                      <Search size={16} /> Buscar moneda para verificar...
                    </span>
                  )}
                </div>
                <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </div>

              {/* Dropdown de búsqueda */}
              <AnimatePresence>
                {isDropdownOpen && (
                  <motion.div 
                    initial={{ opacity: 0, y: -10 }} 
                    animate={{ opacity: 1, y: 0 }} 
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute z-50 mt-2 w-full rounded-xl border border-slate-700 bg-slate-800 shadow-2xl overflow-hidden"
                  >
                    <div className="p-2 border-b border-slate-700">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Escribe el nombre o símbolo..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full bg-transparent text-sm text-white placeholder-slate-400 outline-none px-2 py-1"
                      />
                    </div>
                    <div className="max-h-60 overflow-y-auto">
                      {filteredCoins.length === 0 ? (
                        <p className="p-4 text-xs text-slate-400 text-center">No se encontraron monedas.</p>
                      ) : (
                        filteredCoins.map((coin) => (
                          <div
                            key={coin.id}
                            onClick={() => handleSelectCoin(coin)}
                            className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-slate-700 transition"
                          >
                            <img src={coin.image} alt={coin.name} className="h-6 w-6 rounded-full" />
                            <div>
                              <p className="text-sm font-medium text-white">{coin.name}</p>
                              <p className="text-xs text-slate-400">{coin.symbol.toUpperCase()}</p>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Botón de Verificar */}
            <button
              onClick={handleCheckDeposits}
              disabled={!selectedCoin || isGeneratingAddress || checking}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02] disabled:opacity-50 disabled:hover:scale-100 w-full md:w-auto"
            >
              {checking ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
              {checking ? 'Verificando...' : 'Verificar ingresos'}
            </button>
          </div>

          {/* Dirección de la billetera a verificar (EN PEQUEÑITO) */}
          {selectedCoin && (
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 bg-slate-950/50 p-3 rounded-lg border border-slate-800/50">
              <Wallet size={14} className="text-indigo-400 flex-shrink-0" />
              <span className="truncate">
                {isGeneratingAddress ? (
                  "Generando dirección de billetera..."
                ) : currentAddress ? (
                  <>Billetera a verificar: <span className="font-mono text-slate-300">{currentAddress}</span></>
                ) : (
                  "Error al generar dirección"
                )}
              </span>
            </div>
          )}
        </div>

        {/* RESULTADOS DE LA VERIFICACIÓN */}
        <AnimatePresence>
          {checked && !checking && deposits.length === 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 text-sm text-slate-400 bg-slate-900/40 p-4 rounded-xl border border-slate-800">
              <AlertCircle size={18} className="text-slate-500" />
              No se detectó ningún ingreso en esta billetera.
            </motion.div>
          )}

          {deposits.length > 0 && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
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
                    href={`https://blockchair.com/search?q=${d.hash}`} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-xs text-indigo-400 hover:underline"
                  >
                    Ver transacción
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
