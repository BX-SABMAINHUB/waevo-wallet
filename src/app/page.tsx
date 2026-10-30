"use client";

import Link from "next/link";
import { motion } from "@/components/motion-client";
import {
  ArrowRight,
  ShieldCheck,
  Zap,
  Globe2,
  LineChart,
  Wallet,
  Sparkles,
} from "lucide-react";

// Íconos flotantes de cripto (emoji simple, sin dependencias externas)
const floatingCoins = [
  { symbol: "₿", label: "BTC", color: "text-orange-400", x: "8%", y: "20%", delay: 0 },
  { symbol: "Ξ", label: "ETH", color: "text-indigo-400", x: "85%", y: "15%", delay: 0.4 },
  { symbol: "◎", label: "SOL", color: "text-purple-400", x: "15%", y: "75%", delay: 0.8 },
  { symbol: "₮", label: "USDT", color: "text-emerald-400", x: "78%", y: "70%", delay: 1.2 },
  { symbol: "BNB", label: "BNB", color: "text-yellow-400", x: "50%", y: "8%", delay: 1.6 },
];

const features = [
  {
    icon: ShieldCheck,
    title: "Seguridad de nivel bancario",
    description:
      "Autenticación con 2FA obligatorio (TOTP) y billeteras no custodiadas. Tus claves nunca salen de tu dispositivo.",
  },
  {
    icon: Zap,
    title: "Envíos instantáneos",
    description:
      "Envía y recibe cripto en segundos. Compatible con Ethereum, Bitcoin, Solana y decenas de redes más.",
  },
  {
    icon: LineChart,
    title: "Gráficos profesionales",
    description:
      "Análisis técnico con velas japonesas, reglas y rangos de 1 hora a 10 años. Todo en tu navegador.",
  },
  {
    icon: Globe2,
    title: "Todas las monedas",
    description:
      "Explora miles de criptomonedas en tiempo real con datos agregados de los principales exchanges.",
  },
  {
    icon: Wallet,
    title: "Direcciones permanentes",
    description:
      "Cada usuario tiene su propia dirección única y permanente por cada moneda. Recibe sin límites.",
  },
  {
    icon: Sparkles,
    title: "Diseño premium",
    description:
      "Interfaz pulida, rápida y pensada para durar. Disfruta de una experiencia que se siente mágica.",
  },
];

export default function LandingPage() {
  return (
    <main className="aurora-bg relative min-h-screen overflow-hidden">
      {/* Navbar */}
      <motion.nav
        initial={{ y: -40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="relative z-20 mx-auto flex max-w-7xl items-center justify-between px-6 py-6"
      >
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white shadow-lg shadow-indigo-500/30">
            W
          </div>
          <span className="text-lg font-semibold tracking-tight">Waevo</span>
        </Link>
        <div className="hidden items-center gap-8 text-sm text-slate-300 md:flex">
          <a href="#features" className="transition hover:text-white">Funciones</a>
          <a href="#security" className="transition hover:text-white">Seguridad</a>
          <a href="#charts" className="transition hover:text-white">Gráficos</a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden rounded-xl px-4 py-2 text-sm text-slate-300 transition hover:text-white sm:block"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/register"
            className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-200"
          >
            Crear cuenta
          </Link>
        </div>
      </motion.nav>

      {/* Hero */}
      <section className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-6 pt-16 text-center md:pt-24">
        {/* Monedas flotantes */}
        <div className="pointer-events-none absolute inset-0 hidden md:block">
          {floatingCoins.map((c) => (
            <motion.div
              key={c.label}
              className={`absolute text-3xl font-bold ${c.color} opacity-30 blur-[0.3px]`}
              style={{ left: c.x, top: c.y }}
              animate={{ y: [0, -18, 0] }}
              transition={{
                duration: 5 + c.delay,
                repeat: Infinity,
                ease: "easeInOut",
                delay: c.delay,
              }}
            >
              {c.symbol}
            </motion.div>
          ))}
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="mb-6 inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs text-slate-300"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          Billetera no custodiada · 2FA obligatorio
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="max-w-4xl bg-gradient-to-b from-white to-slate-400 bg-clip-text text-4xl font-bold leading-tight tracking-tight text-transparent md:text-6xl"
        >
          La billetera cripto del futuro, disponible hoy.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="mt-6 max-w-2xl text-base text-slate-400 md:text-lg"
        >
          Explora todas las monedas, analiza sus gráficos con herramientas
          profesionales y envía dinero en segundos. Todo desde un único lugar,
          con la seguridad que mereces.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Link href="/register">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 px-6 py-3 font-semibold text-white shadow-lg shadow-indigo-500/25"
            >
              Empieza gratis
              <ArrowRight
                size={18}
                className="transition-transform group-hover:translate-x-0.5"
              />
            </motion.button>
          </Link>
          <Link href="/login">
            <motion.button
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              className="rounded-xl glass px-6 py-3 font-semibold text-slate-200 transition hover:bg-slate-800/60"
            >
              Ya tengo cuenta
            </motion.button>
          </Link>
        </motion.div>

        {/* Mockup o preview del dashboard (decorativo) */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-16 w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-indigo-500/10 backdrop-blur"
        >
          <div className="flex items-center gap-2 border-b border-slate-800 px-4 py-2">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/70" />
            <span className="ml-4 text-xs text-slate-500">waevo.app/dashboard</span>
          </div>
          <div className="grid grid-cols-1 gap-4 p-6 md:grid-cols-3">
            {[
              { label: "Bitcoin", symbol: "BTC", price: "$72,481.20", change: "+2.14%", up: true },
              { label: "Ethereum", symbol: "ETH", price: "$3,192.55", change: "-0.87%", up: false },
              { label: "Solana", symbol: "SOL", price: "$182.34", change: "+4.62%", up: true },
            ].map((c) => (
              <div
                key={c.symbol}
                className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">{c.label}</span>
                  <span
                    className={`text-xs font-semibold ${
                      c.up ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {c.change}
                  </span>
                </div>
                <div className="mt-2 text-lg font-semibold">{c.price}</div>
                <div className="mt-3 h-10 w-full rounded-md bg-gradient-to-t from-indigo-500/30 to-transparent" />
              </div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Features */}
      <section id="features" className="relative z-10 mx-auto max-w-7xl px-6 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            Todo lo que necesitas, en una sola app
          </h2>
          <p className="mt-4 text-slate-400">
            Waevo reúne lo mejor de una billetera cripto moderna con la
            seguridad de una plataforma bancaria.
          </p>
        </motion.div>

        <div className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: i * 0.05 }}
              whileHover={{ y: -4 }}
              className="group rounded-2xl glass p-6 transition hover:border-indigo-500/40"
            >
              <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 group-hover:bg-indigo-500/20 group-hover:text-indigo-300">
                <f.icon size={22} />
              </div>
              <h3 className="text-lg font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">
                {f.description}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="relative z-10 mx-auto max-w-5xl px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="relative overflow-hidden rounded-3xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/20 via-slate-900 to-cyan-500/10 p-10 text-center md:p-14"
        >
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,rgba(99,102,241,0.25),transparent_60%)]" />
          <h2 className="text-3xl font-bold md:text-4xl">
            Únete a la nueva era de las finanzas
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-300">
            Crea tu cuenta en menos de un minuto, activa el 2FA y empieza a
            mover tu cripto sin límites.
          </p>
          <Link href="/register">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.96 }}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 font-semibold text-slate-950"
            >
              Crear cuenta gratis <ArrowRight size={18} />
            </motion.button>
          </Link>
        </motion.div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-slate-800/60 py-8 text-center text-xs text-slate-500">
        © {new Date().getFullYear()} Waevo Wallet · Billetera no custodiada.
        Tus claves, tu dinero.
      </footer>
    </main>
  );
}
