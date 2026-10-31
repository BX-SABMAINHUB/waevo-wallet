"use client";

import dynamic from "next/dynamic";

// Cargamos el wrapper de Privy SOLO en el cliente (sin SSR)
const PrivyWrapper = dynamic(
  () => import("@/lib/privy").then((mod) => mod.PrivyWrapper),
  { ssr: false }
);

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PrivyWrapper>{children}</PrivyWrapper>;
}
