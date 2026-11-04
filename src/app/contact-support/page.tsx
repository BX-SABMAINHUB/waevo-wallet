"use client";

import { motion } from "@/components/motion-client";
import { Building2, MessageCircle, Mail, ExternalLink, ShieldQuestion } from "lucide-react";

export default function ContactSupportPage() {
  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10 flex items-center justify-center">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-2xl">
        
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center h-20 w-20 rounded-full bg-indigo-500/20 text-indigo-400 mb-6">
            <ShieldQuestion size={40} />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Contacto y Soporte</h1>
          <p className="text-slate-400">Estamos aquí para ayudarte con cualquier problema.</p>
        </div>

        <div className="space-y-6">
          {/* Tarjeta de la Empresa */}
          <div className="rounded-3xl glass p-8 flex items-start gap-6">
            <div className="p-4 bg-indigo-500/20 text-indigo-400 rounded-2xl">
              <Building2 size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Sobre Nosotros</h2>
              <p className="text-slate-400">
                Waevo Wallet es un producto desarrollado y mantenido por <strong>Waevo Cor Inc.</strong>
                <br />
                Nuestra misión es hacer que las finanzas descentralizadas sean accesibles para todos.
              </p>
            </div>
          </div>

          {/* Tarjeta de Discord */}
          <div className="rounded-3xl glass p-8 flex items-start gap-6 border-indigo-500/30">
            <div className="p-4 bg-[#5865F2]/20 text-[#5865F2] rounded-2xl">
              <MessageCircle size={28} />
            </div>
            <div className="w-full">
              <h2 className="text-xl font-bold text-white mb-1">Únete a nuestro Discord</h2>
              <p className="text-slate-400 mb-4">
                La forma más rápida de obtener soporte técnico, reportar errores o sugerir nuevas funciones es a través de nuestro servidor de Discord.
              </p>
              <a 
                href="https://discord.gg/waevohosting" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-[#5865F2] px-6 py-3 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
              >
                Ir a waevohosting.es <ExternalLink size={16} />
              </a>
            </div>
          </div>

          {/* Tarjeta de Email (Opcional) */}
          <div className="rounded-3xl glass p-8 flex items-start gap-6">
            <div className="p-4 bg-slate-700/50 text-slate-300 rounded-2xl">
              <Mail size={28} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white mb-1">Correo Electrónico</h2>
              <p className="text-slate-400">
                Para consultas comerciales o de prensa, escríbenos a: <br />
                <span className="text-indigo-400 font-mono mt-1 inline-block">support@waevohosting.es</span>
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-10">
          © 2026 Waevo Cor Inc. Todos los derechos reservados.
        </p>
      </motion.div>
    </div>
  );
}
