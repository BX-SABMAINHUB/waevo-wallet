"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { motion } from "@/components/motion-client";
import { ArrowRight, Mail, Lock, User, Phone } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    
    try {
      // 1. Crear el usuario en Firebase Auth
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      
      // 2. Llamar a nuestra API para enviar el correo con EmailJS
      const response = await fetch('/api/send-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al enviar el correo de verificación.');
      }

      // 3. Pasar a la pantalla de verificación
      setStep("verify");
    } catch (err: any) {
      // Manejar errores comunes de Firebase (ej. correo ya en uso)
      let errorMessage = err.message || "Error al crear la cuenta";
      if (err.code === "auth/email-already-in-use") {
        errorMessage = "Este correo electrónico ya está registrado.";
      } else if (err.code === "auth/weak-password") {
        errorMessage = "La contraseña es demasiado débil (mínimo 6 caracteres).";
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerified = async () => {
    if (!auth.currentUser) return;
    
    setLoading(true);
    setError("");
    
    try {
      // Recargar el usuario para obtener el estado actual de verificación
      await auth.currentUser.reload();
      
      if (auth.currentUser.emailVerified) {
        // ¡Correo verificado! Redirigimos al dashboard/billetera
        router.push("/explore");
      } else {
        setError("Aún no has verificado tu correo. Revisa tu bandeja de entrada o spam.");
      }
    } catch (err: any) {
      setError("Error al comprobar la verificación.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "verify") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl glass p-8 text-center shadow-2xl"
      >
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-indigo-500/20 text-indigo-400">
          <Mail size={32} />
        </div>
        <h1 className="text-2xl font-bold">Verifica tu correo</h1>
        <p className="mt-3 text-sm text-slate-400 leading-relaxed">
          Hemos enviado un enlace a <strong className="text-white">{email}</strong>.<br/>
          Ábrelo y luego pulsa el botón de abajo.
        </p>
        
        {error && <p className="mt-4 text-xs text-red-400 bg-red-500/10 p-2 rounded-lg">{error}</p>}
        
        <motion.button
          onClick={handleVerified}
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="mt-8 w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 disabled:opacity-60"
        >
          {loading ? "Comprobando..." : "Ya he verificado mi correo"}
        </motion.button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl glass p-8 shadow-2xl shadow-indigo-500/10"
    >
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight">Crea tu cuenta</h1>
        <p className="mt-1 text-sm text-slate-400">
          Únete a Waevo Wallet en menos de un minuto
        </p>
      </div>

      <form onSubmit={handleRegister} className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Nombre completo
          </label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
              placeholder="Tu nombre"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Teléfono
          </label>
          <div className="relative">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
              placeholder="+34 600 000 000"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Correo electrónico
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
              placeholder="tu@email.com"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-slate-400">
            Contraseña
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-700 bg-slate-900/60 py-2.5 pl-10 pr-3 text-sm text-white placeholder-slate-500 outline-none focus:border-indigo-500"
              placeholder="Mínimo 6 caracteres"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-500/10 p-3 text-xs text-red-400 border border-red-500/20">
            {error}
          </div>
        )}

        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 disabled:opacity-60"
        >
          {loading ? "Creando cuenta..." : "Crear cuenta"}
          {!loading && <ArrowRight size={16} />}
        </motion.button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-400">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-indigo-400 hover:underline">
          Inicia sesión
        </Link>
      </p>
    </motion.div>
  );
}
