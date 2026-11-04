"use client";

import { motion } from "@/components/motion-client";
import { 
  Wallet, Compass, ArrowRightLeft, LayoutDashboard, 
  ShieldCheck, Zap, Globe, Key
} from "lucide-react";

export default function HowItWorksPage() {
  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/20 text-indigo-400 mb-6">
            <Zap size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">¿Cómo funciona Waevo Wallet?</h1>
          <p className="text-lg text-slate-400 max-w-2xl mx-auto">
            Waevo es tu billetera cripto no custodiada. Tú tienes el control total de tus fondos en todo momento. 
            Aquí te explicamos qué puedes hacer en cada sección.
          </p>
        </motion.div>

        <div className="space-y-8">
          {/* Sección 1: Overview */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="flex gap-6 items-start rounded-3xl glass p-8">
            <div className="p-4 bg-indigo-500/20 text-indigo-400 rounded-2xl flex-shrink-0">
              <LayoutDashboard size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Overview</h2>
              <p className="text-slate-400 leading-relaxed">
                Es tu centro de control. Desde aquí puedes ver un resumen de tu actividad, acceder rápidamente a las 
                secciones principales y gestionar tu perfil.
              </p>
            </div>
          </motion.div>

          {/* Sección 2: Explorar */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }} className="flex gap-6 items-start rounded-3xl glass p-8">
            <div className="p-4 bg-cyan-500/20 text-cyan-400 rounded-2xl flex-shrink-0">
              <Compass size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Explorar</h2>
              <p className="text-slate-400 leading-relaxed">
                Descubre todas las criptomonedas disponibles en el mercado. Utiliza nuestra búsqueda para encontrar 
                cualquier moneda y visualiza sus gráficos profesionales en tiempo real gracias a la integración con TradingView.
              </p>
            </div>
          </motion.div>

          {/* Sección 3: Tu Billetera */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }} className="flex gap-6 items-start rounded-3xl glass p-8 border-indigo-500/30">
            <div className="p-4 bg-emerald-500/20 text-emerald-400 rounded-2xl flex-shrink-0">
              <Wallet size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Tu Billetera</h2>
              <p className="text-slate-400 leading-relaxed mb-4">
                Es el corazón de Waevo. Aquí es donde gestionas tus activos reales.
              </p>
              <ul className="space-y-3">
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <strong>Recibir:</strong> Genera una dirección única y permanente para cada moneda.
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <strong>Enviar:</strong> Transfiere criptomonedas a cualquier dirección. Las comisiones son transparentes y se calculan en euros.
                </li>
                <li className="flex items-center gap-2 text-sm text-slate-300">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <strong>Detección Automática:</strong> El sistema vigila la blockchain. Si recibes un pago, aparecerá una notificación en vivo.
                </li>
              </ul>
            </div>
          </motion.div>

          {/* Sección 4: Exchange */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 }} className="flex gap-6 items-start rounded-3xl glass p-8">
            <div className="p-4 bg-amber-500/20 text-amber-400 rounded-2xl flex-shrink-0">
              <ArrowRightLeft size={28} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">Exchange y Cambios</h2>
              <p className="text-slate-400 leading-relaxed">
                ¿Tienes LTC pero quieres USDT? Utiliza nuestro intercambio integrado. 
                Conectamos tu orden directamente con proveedores de liquidez como FixedFloat para que el cambio sea real y seguro.
              </p>
            </div>
          </motion.div>

          {/* Seguridad */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="mt-12 rounded-3xl bg-gradient-to-br from-indigo-900/40 to-slate-900/80 p-8 border border-indigo-500/20">
            <div className="flex items-center gap-4 mb-4">
              <ShieldCheck className="text-emerald-400" size={32} />
              <h2 className="text-2xl font-bold text-white">Seguridad de nivel bancario</h2>
            </div>
            <p className="text-slate-300 leading-relaxed">
              Waevo Wallet es <strong>no custodiada</strong>. Esto significa que las claves privadas se generan y almacenan de forma segura 
              (encriptadas), y solo tú puedes autorizar los movimientos. No tenemos acceso a tus fondos.
            </p>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
