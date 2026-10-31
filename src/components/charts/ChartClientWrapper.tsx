"use client";

import dynamic from "next/dynamic";

// Este es el "envoltorio delgado". Su única función es forzar ssr: false.
const CoinChart = dynamic(
  () => import("./CoinChart").then((mod) => mod.CoinChart),
  {
    ssr: false,
    loading: () => <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50" />,
  }
);

export function ChartClientWrapper({ coinId }: { coinId: string }) {
  return <CoinChart coinId={coinId} />;
}
