"use client";

import dynamic from "next/dynamic";

const CoinChart = dynamic(
  () => import("@/components/charts/CoinChart").then((mod) => mod.CoinChart),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50" />
    ),
  }
);

export function ChartWrapper({ coinId }: { coinId: string }) {
  return <CoinChart coinId={coinId} />;
}
