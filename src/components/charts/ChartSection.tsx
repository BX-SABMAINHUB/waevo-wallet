"use client";

import dynamic from "next/dynamic";

const ChartWrapper = dynamic(
  () => import("./ChartWrapper").then((mod) => mod.ChartWrapper),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50" />
    ),
  }
);

export function ChartSection({ coinId }: { coinId: string }) {
  return <ChartWrapper coinId={coinId} />;
}
