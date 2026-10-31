"use client";

import { useState, useEffect } from "react";
import { useWallets, usePrivy } from "@privy-io/react-auth";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "@/components/motion-client";
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  X,
  Copy,
  CheckCircle2,
  Wallet,
  ShieldCheck,
} from "lucide-react";

// Interfaz para las monedas
interface Coin {
  id: string;
  symbol: string;
  name: string;
  image: string;
  current_price: number;
  price_change_percentage_24h: number;
}

export default function WalletPage() {
  const { ready, authenticated, login } = usePrivy();
  const { wallets } = useWallets();
  
  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  
  // Estados para los modales
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [modalType, setModalType] = useState<"send" | "receive" | null>(null);
  
  // Estados del formulario de envío
  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [sendNetwork, setSendNetwork] = useState("Ethereum");
  const [isSending, setIsSending] = useState(false);
  const [copied, setCopied] = useState(false);

  // Obtener la dirección real de la billetera del usuario desde Privy
  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const userAddress = embeddedWallet?.address || "Conectando billetera...";

  // Cargar monedas desde la API
  useEffect(() => {
    async function fetchCoins() {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false"
        );
        const data = await res.json();
        setCoins(data);
      } catch (error) {
        console.error("Error fetching coins:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchCoins();
  }, []);

  const filteredCoins = coins.filter(
    (coin) =>
      coin.name.toLowerCase().includes(search.toLowerCase()) ||
      coin.symbol.toLowerCase().includes(search.toLowerCase())
  );

  // Copiar dirección al portapapeles
  const copyToClipboard = () => {
    if (userAddress) {
      navigator.clipboard.writeText(userAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Manejar el envío
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSending(true);
    
    // Aquí iría la lógica real de envío usando el SDK de Privy
    // Ejemplo: await embeddedWallet.sendTransaction({ to: sendAddress, value: ... })
    
    setTimeout(() => {
      alert(`Simulación: Enviando ${sendAmount} ${selectedCoin?.symbol.toUpperCase()} a ${sendAddress} por la red ${sendNetwork}`);
      setIsSending(false);
      setModalType(null);
      setSendAddress("");
      setSendAmount("");
    }, 2000);
  };

  // Calcular un saldo ficticio para la demo visual (ya que no hay fondos reales aún)
  const mockBalance = 12450.80;

  if (!ready) {
    return <div className="p-10 text-center text-white">Cargando billetera segura...</div>;
  }

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        
        {/* CABECERA: SALDO TOTAL Y DIRECCIÓN */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 backdrop-blur-xl"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-indigo-300 mb-1">Balance Total Estimado</p>
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                ${mockBalance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </h1>
            </div>
            <div className="flex flex-col items-start md:items-end">
              <div className="flex items-center gap-2 rounded-full bg-slate-800/80 px-4 py-2 text-sm text-slate-300 border border-slate-700">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span>Billetera No Custodiada</span>
              </div>
              <button
                onClick={copyToClipboard}
                className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition"
              >
                {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {userAddress.slice(0, 6)}...{userAddress.slice(-4)}
              </button>
            </div>
          </div>
        </motion.div>

        {/* BUSCADOR */}
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Tus Activos</h2>
            <p className="text-sm text-slate-400 mt-1">Selecciona una moneda para enviar o recibir.</p>
          </div>
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar moneda..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 md:w-72"
            />
          </div>
        </div>

        {/* LISTA DE MONEDAS */}
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCoins.map((coin) => (
              <motion.div
                key={coin.id}
                whileHover={{ y: -4 }}
                className="rounded-2xl glass p-5 cursor-pointer hover:border-indigo-500/40 transition"
                onClick={() => setSelectedCoin(coin)}
              >
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <img src={coin.image} alt={coin.name} className="h-10 w-10 rounded-full" />
                    <div>
                      <h3 className="font-semibold text-white">{coin.name}</h3>
                      <span className="text-xs uppercase text-slate-400">{coin.symbol}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-white">${coin.current_price.toLocaleString()}</div>
                  </div>
                </div>
                
                {/* Simulación de saldo de esta moneda */}
                <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                  <div className="text-sm text-slate-400">Tu saldo</div>
                  <div className="text-sm font-semibold text-white">
                    {(Math.random() * 2).toFixed(4)} {coin.symbol.toUpperCase()}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* MENÚ DE ACCIONES (ENVIAR / RECIBIR) */}
      <AnimatePresence>
        {selectedCoin && !modalType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={() => setSelectedCoin(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-slate-700 bg-slate-900 p-6 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <img src={selectedCoin.image} alt={selectedCoin.name} className="h-10 w-10" />
                  <h3 className="text-xl font-bold text-white">{selectedCoin.name}</h3>
                </div>
                <button onClick={() => setSelectedCoin(null)} className="text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setModalType("receive")}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition"
                >
                  <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <ArrowDownLeft size={24} />
                  </div>
                  <span className="font-semibold text-white">Recibir</span>
                </button>
                <button
                  onClick={() => setModalType("send")}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition"
                >
                  <div className="h-12 w-12 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                    <ArrowUpRight size={24} />
                  </div>
                  <span className="font-semibold text-white">Enviar</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE RECIBIR */}
      <AnimatePresence>
        {modalType === "receive" && selectedCoin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setModalType(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl"
            >
              <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white">
                <X size={24} />
              </button>
              <h3 className="text-2xl font-bold text-white mb-2">Recibir {selectedCoin.name}</h3>
              <p className="text-sm text-slate-400 mb-6">
                Esta es tu dirección permanente de {selectedCoin.symbol.toUpperCase()} en la red Ethereum.
              </p>
              
              <div className="bg-white p-4 rounded-2xl inline-block mb-6">
                {/* QR REAL GENERADO CON LA DIRECCIÓN DE PRIVY */}
                <QRCodeSVG value={userAddress} size={200} />
              </div>
              
              <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <span className="text-sm font-mono text-slate-300 truncate">{userAddress}</span>
                <button
                  onClick={copyToClipboard}
                  className="text-indigo-400 hover:text-indigo-300 flex-shrink-0"
                >
                  {copied ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Copy size={20} />}
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-4">
                Envía únicamente {selectedCoin.symbol.toUpperCase()} a esta dirección. De lo contrario, perderás tus fondos.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* MODAL DE ENVIAR */}
      <AnimatePresence>
        {modalType === "send" && selectedCoin && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setModalType(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Enviar {selectedCoin.symbol.toUpperCase()}</h3>
                <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSend} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Dirección del destinatario</label>
                  <input
                    type="text"
                    required
                    value={sendAddress}
                    onChange={(e) => setSendAddress(e.target.value)}
                    placeholder="0x..."
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Red</label>
                    <select
                      value={sendNetwork}
                      onChange={(e) => setSendNetwork(e.target.value)}
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white outline-none focus:border-indigo-500 appearance-none"
                    >
                      <option value="Ethereum">Ethereum</option>
                      <option value="Polygon">Polygon</option>
                      <option value="Base">Base</option>
                      <option value="Arbitrum">Arbitrum</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Cantidad</label>
                    <input
                      type="number"
                      step="any"
                      required
                      value={sendAmount}
                      onChange={(e) => setSendAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSending}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-60 transition hover:scale-[1.02]"
                  >
                    {isSending ? "Procesando envío..." : "Confirmar Envío"}
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
