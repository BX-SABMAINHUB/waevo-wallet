"use client";

import { useState } from "react";
import { motion } from "@/components/motion-client";
import { Globe, ArrowRightLeft, Send, Download, ShieldCheck } from "lucide-react";

// Diccionario de traducciones para los 5 idiomas más hablados
const translations = {
  es: {
    title: "Comisiones de Waevo Wallet",
    subtitle: "Transparencia total en cada operación. Sin letra pequeña.",
    sendTitle: "Comisiones de Envío",
    sendDesc: "Para envíos de criptomonedas a otras billeteras.",
    sendFee1: "Envíos de 0.03€ a 5€",
    sendFee1Value: "0.01€ (Fijo)",
    sendFee2: "Envíos de 6€ a 50€",
    sendFee2Value: "2.50%",
    exchangeTitle: "Comisiones de Exchange",
    exchangeDesc: "Intercambios entre diferentes criptomonedas.",
    exchangeFee: "Comisión de FixedFloat + Spread",
    exchangeFeeValue: "Variable (~1% - 2.5%)",
    receiveTitle: "Comisiones de Recepción",
    receiveDesc: "Recibir fondos en tu billetera Waevo.",
    receiveFeeValue: "Gratis (Solo pagas la tarifa de red)",
  },
  en: {
    title: "Waevo Wallet Fees",
    subtitle: "Total transparency in every operation. No hidden fees.",
    sendTitle: "Sending Fees",
    sendDesc: "For sending cryptocurrencies to other wallets.",
    sendFee1: "Transfers from €0.03 to €5",
    sendFee1Value: "€0.01 (Fixed)",
    sendFee2: "Transfers from €6 to €50",
    sendFee2Value: "2.50%",
    exchangeTitle: "Exchange Fees",
    exchangeDesc: "Swaps between different cryptocurrencies.",
    exchangeFee: "FixedFloat Fee + Spread",
    exchangeFeeValue: "Variable (~1% - 2.5%)",
    receiveTitle: "Receiving Fees",
    receiveDesc: "Receiving funds into your Waevo wallet.",
    receiveFeeValue: "Free (You only pay the network fee)",
  },
  zh: {
    title: "Waevo 钱包手续费",
    subtitle: "每笔交易完全透明，无隐藏费用。",
    sendTitle: "发送手续费",
    sendDesc: "向其他钱包发送加密货币。",
    sendFee1: "0.03€ 至 5€ 的转账",
    sendFee1Value: "0.01€ (固定)",
    sendFee2: "6€ 至 50€ 的转账",
    sendFee2Value: "2.50%",
    exchangeTitle: "兑换手续费",
    exchangeDesc: "不同加密货币之间的兑换。",
    exchangeFee: "FixedFloat 费用 + 点差",
    exchangeFeeValue: "浮动 (~1% - 2.5%)",
    receiveTitle: "接收手续费",
    receiveDesc: "将资金接收到您的 Waevo 钱包。",
    receiveFeeValue: "免费（仅支付网络费）",
  },
  hi: {
    title: "Waevo वॉलेट शुल्क",
    subtitle: "हर लेनदेन में पूरी पारदर्शिता। कोई छिपा हुआ शुल्क नहीं।",
    sendTitle: "भेजने का शुल्क",
    sendDesc: "अन्य वॉलेट में क्रिप्टोकरेंसी भेजने के लिए।",
    sendFee1: "€0.03 से €5 तक ट्रांसफर",
    sendFee1Value: "€0.01 (निश्चित)",
    sendFee2: "€6 से €50 तक ट्रांसफर",
    sendFee2Value: "2.50%",
    exchangeTitle: "एक्सचेंज शुल्क",
    exchangeDesc: "विभिन्न क्रिप्टोकरेंसी के बीच स्वैप।",
    exchangeFee: "FixedFloat शुल्क + स्प्रेड",
    exchangeFeeValue: "परिवर्तनीय (~1% - 2.5%)",
    receiveTitle: "प्राप्ति शुल्क",
    receiveDesc: "अपने Waevo वॉलेट में धन प्राप्त करना।",
    receiveFeeValue: "मुफ़्त (आप केवल नेटवर्क शुल्क का भुगतान करते हैं)",
  },
  ar: {
    title: "رسوم محفظة Waevo",
    subtitle: "شفافية كاملة في كل عملية. لا رسوم خفية.",
    sendTitle: "رسوم الإرسال",
    sendDesc: "لإرسال العملات المشفرة إلى محافظ أخرى.",
    sendFee1: "تحويلات من 0.03€ إلى 5€",
    sendFee1Value: "0.01€ (ثابت)",
    sendFee2: "تحويلات من 6€ إلى 50€",
    sendFee2Value: "2.50%",
    exchangeTitle: "رسوم التبادل",
    exchangeDesc: "المقايضة بين العملات المشفرة المختلفة.",
    exchangeFee: "رسوم FixedFloat + الفارق",
    exchangeFeeValue: "متغير (~1% - 2.5%)",
    receiveTitle: "رسوم الاستلام",
    receiveDesc: "استلام الأموال في محفظة Waevo الخاصة بك.",
    receiveFeeValue: "مجاني (تدفع فقط رسوم الشبكة)",
  }
};

type Lang = keyof typeof translations;

export default function GlobComisionPage() {
  const [lang, setLang] = useState<Lang>("es");
  const t = translations[lang];

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-10 text-center relative">
          {/* Selector de Idioma */}
          <div className="absolute right-0 top-0 flex gap-2 bg-slate-900/50 p-1 rounded-lg border border-slate-700">
            {(["es", "en", "zh", "hi", "ar"] as Lang[]).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-1 text-xs font-bold rounded-md uppercase transition ${lang === l ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-white"}`}
              >
                {l}
              </button>
            ))}
          </div>

          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/20 text-indigo-400 mb-6">
            <Globe size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">{t.title}</h1>
          <p className="text-lg text-slate-400">{t.subtitle}</p>
        </motion.div>

        <div className="grid gap-6">
          {/* Tarjeta de Envío */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="rounded-3xl glass p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl"><Send size={24} /></div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t.sendTitle}</h2>
                <p className="text-sm text-slate-400">{t.sendDesc}</p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                <span className="text-slate-300">{t.sendFee1}</span>
                <span className="text-xl font-bold text-emerald-400">{t.sendFee1Value}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-slate-900/50 rounded-xl border border-slate-800">
                <span className="text-slate-300">{t.sendFee2}</span>
                <span className="text-xl font-bold text-emerald-400">{t.sendFee2Value}</span>
              </div>
            </div>
          </motion.div>

          {/* Tarjeta de Exchange */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="rounded-3xl glass p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-amber-500/20 text-amber-400 rounded-xl"><ArrowRightLeft size={24} /></div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t.exchangeTitle}</h2>
                <p className="text-sm text-slate-400">{t.exchangeDesc}</p>
              </div>
            </div>
            <div className="flex justify-between items-center p-4 bg-slate-900/50 rounded-xl border border-slate-800">
              <span className="text-slate-300">{t.exchangeFee}</span>
              <span className="text-xl font-bold text-amber-400">{t.exchangeFeeValue}</span>
            </div>
          </motion.div>

          {/* Tarjeta de Recepción */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="rounded-3xl glass p-8">
            <div className="flex items-center gap-4 mb-6">
              <div className="p-3 bg-emerald-500/20 text-emerald-400 rounded-xl"><Download size={24} /></div>
              <div>
                <h2 className="text-2xl font-bold text-white">{t.receiveTitle}</h2>
                <p className="text-sm text-slate-400">{t.receiveDesc}</p>
              </div>
            </div>
            <div className="flex justify-between items-center p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
              <span className="text-emerald-300 font-medium">{t.receiveFeeValue}</span>
              <ShieldCheck className="text-emerald-400" size={24} />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
