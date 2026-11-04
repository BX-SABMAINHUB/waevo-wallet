"use client";

import Link from "next/link";
import { motion } from "@/components/motion-client";
import { BookOpen, Coins, HelpCircle, MessageCircle, ArrowRight } from "lucide-react";

export default function DocumentationPage() {
  const docs = [
    {
      title: "Comisiones",
      description: "Consulta todas las tarifas de envío, recepción y exchange de forma clara y transparente en 5 idiomas.",
      href: "/globcomision",
      icon: Coins,
      color: "text-amber-400",
      bgColor: "bg-amber-500/10",
      borderColor: "hover:border-amber-500/50",
    },
    {
      title: "¿Cómo funciona?",
      description: "Aprende para qué sirve cada sección de Waevo Wallet, cómo gestionar tus activos y cómo funciona la seguridad.",
      href: "/howitworks",
      icon: HelpCircle,
      color: "text-indigo-400",
      bgColor: "bg-indigo-500/10",
      borderColor: "hover:border-indigo-500/50",
    },
    {
      title: "Soporte y Contacto",
      description: "¿Necesitas ayuda? Descubre cómo contactar con Waevo Cor Inc. a través de nuestro servidor de Discord.",
      href: "/contact-support",
      icon: MessageCircle,
      color: "text-emerald-400",
      bgColor: "bg-emerald-500/10",
      borderColor: "hover:border-emerald-500/50",
    },
  ];

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        
        {/* Cabecera */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-12 text-center">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-indigo-500/20 text-indigo-400 mb-6">
            <BookOpen size={32} />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4 tracking-tight">
            Información y Documentación
          </h1>
          <p className="text-lg text-slate-400 max-w-3xl mx-auto leading-relaxed">
            En esta sección encontrarás toda la información oficial de Waevo Wallet. 
            Podrás consultar nuestras comisiones de forma transparente, aprender cómo funciona cada sección de la billetera 
            y descubrir cómo contactar con nuestro equipo de soporte en caso de necesitar ayuda.
          </p>
        </motion.div>

        {/* Tarjetas de Enlaces */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {docs.map((doc, i) => (
            <Link key={doc.title} href={doc.href}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.1 }}
                whileHover={{ y: -5 }}
                className={`group h-full rounded-3xl glass p-8 transition-all border border-slate-800 ${doc.borderColor}`}
              >
                <div className={`mb-6 inline-flex h-14 w-14 items-center justify-center rounded-2xl ${doc.bgColor} ${doc.color}`}>
                  <doc.icon size={28} />
                </div>
                <h2 className="text-xl font-bold text-white mb-3">{doc.title}</h2>
                <p className="text-sm text-slate-400 leading-relaxed mb-6">
                  {doc.description}
                </p>
                <div className={`flex items-center text-sm font-semibold ${doc.color}`}>
                  Leer más <ArrowRight size={16} className="ml-1 transition-transform group-hover:translate-x-1" />
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
