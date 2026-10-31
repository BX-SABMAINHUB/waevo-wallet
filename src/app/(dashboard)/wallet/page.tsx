"use client";

import { useState, useEffect, useMemo } from "react";
import { useWallets, useSendTransaction, usePrivy } from "@privy-io/react-auth";
import { createPublicClient, http, formatEther, parseEther } from "viem";
import { mainnet } from "viem/chains";
import { QRCodeSVG } from "qrcode.react";
import { motion, AnimatePresence } from "@/components/motion-client";
import { auth } from "@/lib/firebase";
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
  const uid = auth.currentUser?.uid || "";

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
          "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&sparkline=false"
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
    } catch (error: any) {
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

  // --- GENERACIÓN DE DIRECCIÓN DETERMINISTA (PERMANENTE) ---
  const handleOpenReceive = async (coin: Coin) => {
    if (!embeddedWallet || !uid) return;

    // Si ya tenemos la dirección en memoria, la usamos
    if (depositAddresses[coin.id]) {
      setSelectedCoin(coin);
      setModalType("receive");
      return;
    }

    setIsGeneratingAddress(true);
    try {
      const res = await fetch('/api/generate-address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: coin.symbol, userId: uid }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error generando dirección');

      setDepositAddresses(prev => ({ ...prev, [coin.id]: data.address }));
      setSelectedCoin(coin);
      setModalType("receive");
    } catch (error: any) {
      console.error("Error:", error);
      alert(`❌ Error al generar dirección para ${coin.name}. ${error.message}`);
    } finally {
      setIsGeneratingAddress(false);
    }
  };

  const getReceiveAddressForModal = () => {
    if (!selectedCoin) return { address: "", network: "" };
    return { 
      address: depositAddresses[selectedCoin.id] || "", 
      network: `Red ${selectedCoin.name}` 
    };
  };

  if (!ready) return <div className="p-10 text-white">Cargando...</div>;

  if (!authenticated || !embeddedWallet) {
    return (
      <div className="aurora-bg min-h-screen flex items-center justify-center p-6">
        <motion.div className="max-w-md w-full rounded-3xl border border-indigo-500/30 bg-slate-900/80 p-8 text-center">
          <Wallet size={40} className="mx-auto text-indigo-400 mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Activa tu Billetera</h2>
          <button onClick={login} className="w-full rounded-xl bg-indigo-500 py-3 text-white font-semibold mt-4">
            Crear mi Billetera
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-6xl">
        
        <div className="mb-10 rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8">
          <h1 className="text-4xl font-bold text-white">
            ${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </h1>
          <p className="text-sm text-slate-400">{parseFloat(nativeBalance).toFixed(6)} ETH</p>
        </div>

        <div className="mb-8 flex justify-between items-center">
          <h2 className="text-2xl font-bold text-white">Tus Activos</h2>
          <input
            type="text"
            placeholder="Buscar moneda..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-white"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredCoins.map((coin) => (
            <div
              key={coin.id}
              onClick={() => setSelectedCoin(coin)}
              className="rounded-2xl glass p-5 cursor-pointer hover:border-indigo-500/40"
            >
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-3">
                  <img src={coin.image} className="h-10 w-10 rounded-full" />
                  <div>
                    <h3 className="font-semibold text-white">{coin.name}</h3>
                    <span className="text-xs text-slate-400">{coin.symbol}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-medium text-white">${coin.current_price.toLocaleString()}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL ACCIONES */}
      <AnimatePresence>
        {selectedCoin && !modalType && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onClick={() => setSelectedCoin(null)}>
            <div className="w-full max-w-sm rounded-3xl bg-slate-900 p-6" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-xl font-bold text-white mb-4">{selectedCoin.name}</h3>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={() => handleOpenReceive(selectedCoin)} className="bg-slate-800 p-4 rounded-xl text-white">
                  {isGeneratingAddress ? "Cargando..." : "Recibir"}
                </button>
                <button onClick={() => setModalType("send")} className="bg-indigo-600 p-4 rounded-xl text-white">
                  Enviar
                </button>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL RECIBIR */}
      <AnimatePresence>
        {modalType === "receive" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setModalType(null)}>
            <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl text-center" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-2xl font-bold text-white mb-4">Recibir {selectedCoin.name}</h3>
              <div className="bg-white p-4 inline-block rounded-xl mb-4">
                <QRCodeSVG value={getReceiveAddressForModal().address} size={200} />
              </div>
              <div className="bg-slate-800 p-4 rounded-xl flex justify-between items-center">
                <span className="text-sm text-slate-300 truncate">{getReceiveAddressForModal().address}</span>
                <button onClick={() => copyToClipboard(getReceiveAddressForModal().address)} className="text-indigo-400">
                  <Copy size={20} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-4">Red: {getReceiveAddressForModal().network}</p>
              <button onClick={() => setModalType(null)} className="mt-6 w-full bg-slate-800 p-2 rounded-xl text-white">
                Cerrar
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL ENVIAR */}
      <AnimatePresence>
        {modalType === "send" && selectedCoin && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setModalType(null)}>
            <div className="w-full max-w-md bg-slate-900 p-8 rounded-3xl" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-2xl font-bold text-white mb-4">Enviar {selectedCoin.symbol}</h3>
              <form onSubmit={handleSend} className="space-y-4">
                <input type="text" placeholder="Dirección" value={sendAddress} onChange={e => setSendAddress(e.target.value)} className="w-full p-3 rounded-xl bg-slate-800 text-white" />
                <input type="number" placeholder="Cantidad" value={sendAmount} onChange={e => setSendAmount(e.target.value)} className="w-full p-3 rounded-xl bg-slate-800 text-white" />
                <button type="submit" disabled={isSending} className="w-full bg-indigo-500 p-3 rounded-xl text-white font-bold">
                  {isSending ? "Enviando..." : "Confirmar"}
                </button>
              </form>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
