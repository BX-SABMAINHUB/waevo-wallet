"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallets, useSendTransaction, usePrivy } from "@privy-io/react-auth";
import { createPublicClient, http, formatEther, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "@/components/motion-client";
import { Coinlib } from "coinlib-sdk";
import { 
  Search, ArrowDownLeft, ArrowUpRight, X, Copy, CheckCircle2, 
  ShieldCheck, Wallet, AlertCircle, Loader2, TrendingUp, TrendingDown
} from "lucide-react";

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
  const { sendTransaction } = useSendTransaction();

  const [coins, setCoins] = useState<Coin[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedCoin, setSelectedCoin] = useState<Coin | null>(null);
  const [modalType, setModalType] = useState<"send" | "receive" | null>(null);
  
  const [nativeBalance, setNativeBalance] = useState<string>("0");
  const [isBalanceLoading, setIsBalanceLoading] = useState(true);

  const [sendAddress, setSendAddress] = useState("");
  const [sendAmount, setSendAmount] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [selectedNetwork, setSelectedNetwork] = useState("Ethereum");

  const [depositAddresses, setDepositAddresses] = useState<Record<string, string>>({});
  const [isGeneratingAddress, setIsGeneratingAddress] = useState(false);
  const [copied, setCopied] = useState(false);

  const embeddedWallet = wallets.find((w) => w.walletClientType === "privy");
  const userAddress: string = embeddedWallet?.address || "";

  useEffect(() => {
    if (!userAddress) {
      setIsBalanceLoading(false);
      return;
    }
    const fetchBalance = async () => {
      setIsBalanceLoading(true);
      try {
        const client = createPublicClient({ chain: mainnet, transport: http() });
        const balanceWei = await client.getBalance({ address: userAddress as `0x${string}` });
        setNativeBalance(formatEther(balanceWei));
      } catch (error) {
        console.error("Error obteniendo saldo:", error);
        setNativeBalance("0");
      } finally {
        setIsBalanceLoading(false);
      }
    };
    fetchBalance();
  }, [userAddress]);

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!embeddedWallet || !selectedCoin) return;
    setIsSending(true);
    try {
      const valueInWei = parseEther(sendAmount);
      const { hash } = await sendTransaction({ to: sendAddress, value: valueInWei });
      alert(`✅ Transacción enviada.\nHash: ${hash}`);
      setModalType(null);
      setSendAddress("");
      setSendAmount("");
      if (userAddress) {
        const client = createPublicClient({ chain: mainnet, transport: http() });
        const balanceWei = await client.getBalance({ address: userAddress as `0x${string}` });
        setNativeBalance(formatEther(balanceWei));
      }
    } catch (error: any) {
      console.error("Error al enviar:", error);
      alert(`❌ Error: ${error.message || "Revisa tu conexión o saldo"}`);
    } finally {
      setIsSending(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const totalUsd = useMemo(() => {
    const ethPrice = coins.find((c) => c.id === "ethereum")?.current_price || 0;
    return parseFloat(nativeBalance) * ethPrice;
  }, [nativeBalance, coins]);

  // --- GENERACIÓN DE DIRECCIONES REALES ---
  const handleOpenReceive = async (coin: Coin) => {
    if (!embeddedWallet) return;

    if (depositAddresses[coin.id]) {
      setSelectedCoin(coin);
      setModalType("receive");
      return;
    }

    setIsGeneratingAddress(true);
    try {
      const symbol = coin.symbol.toUpperCase();

      // 1. EVM y Solana: dirección real de Privy
      const evmSymbols = ["ETH", "MATIC", "USDT", "USDC", "BNB", "AVAX", "ARB", "OP", "BASE"];
      if (evmSymbols.includes(symbol)) {
        setDepositAddresses(prev => ({ ...prev, [coin.id]: embeddedWallet.address }));
        setSelectedCoin(coin);
        setModalType("receive");
        return;
      }

      // 2. Resto de monedas: coinlib-sdk genera dirección válida
      const seed = `waevo-seed-${embeddedWallet.address.slice(2, 10)}`;
      const config = {
        coins: symbol,
        network: "mainnet" as const,
        seed: seed,
      };

      const coinlib = new Coinlib(config);
      const address = await coinlib.deriveAddress(0); // Nota: es asíncrono

      setDepositAddresses(prev => ({ ...prev, [coin.id]: address }));
      setSelectedCoin(coin);
      setModalType("receive");

    } catch (error: any) {
      console.error("Error generando dirección:", error);
      alert(`❌ No se pudo generar la dirección para ${coin.name}.`);
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  const getReceiveAddressForModal = () => {
    if (!selectedCoin) return { address: "", network: "" };
    if (depositAddresses[selectedCoin.id]) {
      const symbol = selectedCoin.symbol.toUpperCase();
      const isEvm = ["ETH", "MATIC", "USDT", "USDC", "BNB", "AVAX", "ARB", "OP", "BASE"].includes(symbol);
      return { 
        address: depositAddresses[selectedCoin.id], 
        network: isEvm ? "Red EVM / Compatible" : `Red ${selectedCoin.name}` 
      };
    }
    return { address: "Generando dirección...", network: "Cargando" };
  };

  if (!ready) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center p-6">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="animate-spin text-indigo-500" size={40} />
          <p className="text-slate-400">Cargando entorno seguro...</p>
        </div>
      </div>
    );
  }

  if (!authenticated || !embeddedWallet) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center p-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full rounded-3xl border border-indigo-500/30 bg-slate-900/80 p-8 text-center backdrop-blur-xl shadow-2xl shadow-indigo-500/10"
        >
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
            <Wallet size={40} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Activa tu Billetera Cripto</h2>
          <p className="text-sm text-slate-400 mb-8 leading-relaxed">
            Para empezar a enviar y recibir criptomonedas, necesitas crear tu billetera segura. Es gratis, no custodiada y solo tarda un segundo.
          </p>
          <button
            onClick={login}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:scale-[1.02]"
          >
            Crear mi Billetera Segura
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 backdrop-blur-xl shadow-xl"
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p className="text-sm font-medium text-indigo-300 mb-1">Balance Total</p>
              <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">
                ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h1>
              <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
                {isBalanceLoading ? (
                  <><Loader2 size={14} className="animate-spin" /> Calculando saldo...</>
                ) : (
                  `${parseFloat(nativeBalance).toFixed(6)} ETH`
                )}
              </p>
            </div>
            <div className="flex flex-col items-start md:items-end">
              <div className="flex items-center gap-2 rounded-full bg-slate-800/80 px-4 py-2 text-sm text-slate-300 border border-slate-700">
                <ShieldCheck size={16} className="text-emerald-400" />
                <span>Billetera No Custodiada</span>
              </div>
              <button
                onClick={() => copyToClipboard(userAddress)}
                className="mt-3 flex items-center gap-2 text-xs text-slate-400 hover:text-white transition bg-slate-800/40 px-3 py-1.5 rounded-lg border border-slate-700/50"
              >
                {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                {userAddress ? `${userAddress.slice(0, 6)}...${userAddress.slice(-4)}` : "Cargando..."}
              </button>
            </div>
          </div>
        </motion.div>

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
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 md:w-72 transition"
            />
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-800/50" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCoins.map((coin) => {
              const isEth = coin.id === "ethereum";
              const balanceDisplay = isEth ? parseFloat(nativeBalance).toFixed(4) : "0.0000";
              const isPositive = (coin.price_change_percentage_24h || 0) >= 0;
              return (
                <motion.div
                  key={coin.id}
                  whileHover={{ y: -4 }}
                  className="rounded-2xl glass p-5 cursor-pointer hover:border-indigo-500/40 transition group"
                  onClick={() => setSelectedCoin(coin)}
                >
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <img src={coin.image} alt={coin.name} className="h-10 w-10 rounded-full group-hover:scale-110 transition" />
                      <div>
                        <h3 className="font-semibold text-white">{coin.name}</h3>
                        <span className="text-xs uppercase text-slate-400">{coin.symbol}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium text-white">${coin.current_price.toLocaleString()}</div>
                      <div className={`flex items-center justify-end gap-1 text-xs font-medium ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                        {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {Math.abs(coin.price_change_percentage_24h || 0).toFixed(2)}%
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-slate-800 pt-3">
                    <div className="text-sm text-slate-400">Tu saldo</div>
                    <div className="text-sm font-semibold text-white">
                      {balanceDisplay} {coin.symbol.toUpperCase()}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

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
                <button onClick={() => setSelectedCoin(null)} className="text-slate-400 hover:text-white transition bg-slate-800 rounded-full p-1">
                  <X size={20} />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleOpenReceive(selectedCoin)}
                  disabled={isGeneratingAddress}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition border border-slate-700/50 disabled:opacity-50"
                >
                  {isGeneratingAddress ? (
                    <Loader2 className="animate-spin text-emerald-400" size={24} />
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                      <ArrowDownLeft size={24} />
                    </div>
                  )}
                  <span className="font-semibold text-white">Recibir</span>
                </button>
                <button
                  onClick={() => setModalType("send")}
                  className="flex flex-col items-center justify-center gap-2 rounded-2xl bg-slate-800 p-6 hover:bg-slate-700 transition border border-slate-700/50"
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
              className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 text-center shadow-2xl relative"
            >
              <button onClick={() => setModalType(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 rounded-full p-2 transition">
                <X size={20} />
              </button>
              <h3 className="text-2xl font-bold text-white mb-2">Recibir {selectedCoin.name}</h3>
              <div className="mb-6 inline-block rounded-full bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-400 border border-indigo-500/20">
                {getReceiveAddressForModal().network}
              </div>
              <div className="bg-white p-4 rounded-2xl inline-block mb-6 shadow-lg">
                <QRCodeSVG value={getReceiveAddressForModal().address} size={200} />
              </div>
              <div className="bg-slate-800 rounded-xl p-4 flex items-center justify-between gap-3 border border-slate-700">
                <span className="text-sm font-mono text-slate-300 truncate">
                  {getReceiveAddressForModal().address}
                </span>
                <button 
                  onClick={() => copyToClipboard(getReceiveAddressForModal().address)} 
                  className="text-indigo-400 hover:text-indigo-300 flex-shrink-0 transition"
                >
                  {copied ? <CheckCircle2 size={20} className="text-emerald-400" /> : <Copy size={20} />}
                </button>
              </div>
              <div className="flex items-start gap-2 mt-4 p-3 rounded-lg bg-amber-500/10 text-amber-400 text-left border border-amber-500/20">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">
                  Esta es una dirección determinista generada para {selectedCoin.name}. Asegúrate de enviar {selectedCoin.symbol.toUpperCase()} a través de la red correcta.
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
              className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl relative"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-2xl font-bold text-white">Enviar {selectedCoin.symbol.toUpperCase()}</h3>
                <button onClick={() => setModalType(null)} className="text-slate-400 hover:text-white bg-slate-800 rounded-full p-2 transition">
                  <X size={20} />
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
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Red</label>
                  <select
                    value={selectedNetwork}
                    onChange={(e) => setSelectedNetwork(e.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white outline-none focus:border-indigo-500 appearance-none transition"
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
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 py-3 px-4 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={isSending}
                    className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-60 transition hover:scale-[1.02] flex items-center justify-center gap-2"
                  >
                    {isSending ? (
                      <><Loader2 size={18} className="animate-spin" /> Firmando y enviando...</>
                    ) : (
                      "Confirmar Envío Real"
                    )}
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
