"use client";

import Link from "next/link";
import { motion } from "@/components/motion-client";
import { ArrowRight, Compass, Wallet, Settings, ShieldCheck } from "lucide-react";

export default function OverviewPage() {
  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Bienvenido a Waevo Wallet
          </h1>
          <p className="mt-2 text-slate-400">
            Tu centro de control para el mundo cripto. ¿Por dónde quieres empezar?
          </p>
        </motion.div>

        {/* Tarjetas de las 4 secciones */}
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Tarjeta 1: Explorar */}
          <Link href="/explore">
            <motion.div
              whileHover={{ y: -5 }}
              className="group h-full rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition hover:border-indigo-500/50"
            >
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400 group-hover:bg-indigo-500/20">
                <Compass size={28} />
              </div>
              <h2 className="text-xl font-bold text-white">Explorar Monedas</h2>
              <p className="mt-2 text-sm text-slate-400">
                Analiza gráficos profesionales y descubre las mejores criptomonedas del mercado.
              </p>
              <div className="mt-6 flex items-center text-sm font-medium text-indigo-400">
                Ir a explorar <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>
          </Link>

          {/* Tarjeta 2: Tu Billetera */}
          <Link href="/wallet">
            <motion.div
              whileHover={{ y: -5 }}
              className="group h-full rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition hover:border-emerald-500/50"
            >
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20">
                <Wallet size={28} />
              </div>
              <h2 className="text-xl font-bold text-white">Tu Billetera</h2>
              <p className="mt-2 text-sm text-slate-400">
                Gestiona tus fondos, recibe pagos y envía criptomonedas a cualquier parte del mundo.
              </p>
              <div className="mt-6 flex items-center text-sm font-medium text-emerald-400">
                Ver mi billetera <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>
          </Link>

          {/* Tarjeta 3: Ajustes */}
          <Link href="/settings">
            <motion.div
              whileHover={{ y: -5 }}
              className="group h-full rounded-3xl border border-slate-800 bg-slate-900/50 p-8 transition hover:border-slate-500/50"
            >
              <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-500/10 text-slate-400 group-hover:bg-slate-500/20">
                <Settings size={28} />
              </div>
              <h2 className="text-xl font-bold text-white">Ajustes de Cuenta</h2>
              <p className="mt-2 text-sm text-slate-400">
                Configura tu perfil, revisa tu seguridad y gestiona la verificación en dos pasos.
              </p>
              <div className="mt-6 flex items-center text-sm font-medium text-slate-400">
                Ir a ajustes <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
              </div>
            </motion.div>
          </Link>

          {/* Tarjeta 4: Seguridad / Estado */}
          <motion.div
            whileHover={{ y: -5 }}
            className="h-full rounded-3xl border border-slate-800 bg-gradient-to-br from-indigo-900/40 to-slate-900/50 p-8"
          >
            <div className="mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-300">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-xl font-bold text-white">Cuenta Protegida</h2>
            <p className="mt-2 text-sm text-slate-400">
              Tu cuenta está asegurada con verificación en dos pasos (2FA) y billeteras no custodiadas.
            </p>
            <div className="mt-6 flex items-center text-sm font-medium text-indigo-300">
              Estado: Óptimo
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
