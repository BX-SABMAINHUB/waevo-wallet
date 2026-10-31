"use client";

import dynamic from "next/dynamic";
import { use } from "react";

// Importación dinámica: el gráfico solo se carga en el navegador
const CoinChart = dynamic(
  () => import("@/components/charts/CoinChart").then((mod) => mod.CoinChart),
  { ssr: false }
);

interface CoinPageProps {
  params: Promise<{ id: string }>;
}

export default function CoinPage({ params }: CoinPageProps) {
  // Desenvolvemos los params con el hook `use` de React
  const { id } = use(params);

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold capitalize">
          {id.replace("-", " ")}
        </h1>
        
        <div className="rounded-2xl glass p-4 md:p-6">
          <CoinChart coinId={id} />
        </div>
      </div>
    </div>
  );
}
