"use client";

import { use } from "react";
import dynamic from "next/dynamic";

// Importación dinámica con ssr: false para que Next.js NUNCA cargue este componente en el servidor
const CoinChart = dynamic(
  () => import("@/components/charts/CoinChart").then((mod) => mod.CoinChart),
  { 
    ssr: false,
    loading: () => <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50" />
  }
);

interface CoinPageProps {
  params: Promise<{ id: string }>;
}

export default function CoinPage({ params }: CoinPageProps) {
  const { id } = use(params);

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold capitalize">
          {id.replace(/-/g, " ")}
        </h1>
        <div className="rounded-2xl glass p-4 md:p-6">
          <CoinChart coinId={id} />
        </div>
      </div>
    </div>
  );
}
