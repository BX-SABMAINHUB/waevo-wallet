"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Compass, Wallet, History, Settings, ArrowRightLeft } from "lucide-react";

const PrivyWrapper = dynamic(
  () => import("@/lib/privy").then((mod) => mod.PrivyWrapper),
  { ssr: false }
);

const NAV_ITEMS = [
  { name: "Overview", href: "/overview", icon: LayoutDashboard },
  { name: "Explorar", href: "/explore", icon: Compass },
  { name: "Tu Billetera", href: "/wallet", icon: Wallet },
  { name: "Exchange y Cambios", href: "/exchange", icon: ArrowRightLeft }, // 🔥 NUEVO
  { name: "Ingresos y Historial", href: "/history", icon: History },
  { name: "Ajustes", href: "/settings", icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <PrivyWrapper>
      <div className="flex min-h-screen bg-slate-950">
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

        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </PrivyWrapper>
  );
}
