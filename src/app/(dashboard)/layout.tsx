"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { 
  LayoutDashboard, 
  Compass, 
  Wallet, 
  ArrowRightLeft, 
  Settings,
  BookOpen,
  Landmark // 🔥 Nuevo icono para Vender y Transferir
} from "lucide-react";

// Cargamos Privy SOLO en el cliente para evitar errores de SSR (createContext)
const PrivyWrapper = dynamic(
  () => import("@/lib/privy").then((mod) => mod.PrivyWrapper),
  { ssr: false }
);

// Menú de navegación lateral completo
const NAV_ITEMS = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "Explorar", href: "/explore", icon: Compass },
  { name: "Tu Billetera", href: "/wallet", icon: Wallet },
  { name: "Exchange y Cambios", href: "/exchange", icon: ArrowRightLeft },
  { name: "Vender y Transferir", href: "/sell-and-transfer", icon: Landmark }, // 🔥 Nueva sección
  { name: "Información y Documentación", href: "/documentation", icon: BookOpen },
  { name: "Ajustes", href: "/settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PrivyWrapper>
      <div className="flex min-h-screen bg-slate-950">
        
        {/* Menú Lateral (Sidebar) */}
        <aside className="w-64 border-r border-slate-800 bg-slate-900/50 p-6 hidden md:block">
          <Link href="/" className="flex items-center gap-2 mb-10">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-400 font-bold text-white shadow-lg">
              W
            </div>
            <span className="text-xl font-bold text-white">Waevo</span>
          </Link>

          <nav className="space-y-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-indigo-500/10 text-indigo-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white"
                  }`}
                >
                  <item.icon size={20} />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Contenido Principal */}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </PrivyWrapper>
  );
}
