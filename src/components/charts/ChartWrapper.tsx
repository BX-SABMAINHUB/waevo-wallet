"use client";

import { CoinChart } from "./CoinChart";

export function ChartWrapper({ coinId }: { coinId: string }) {
  return <CoinChart coinId={coinId} />;
}
