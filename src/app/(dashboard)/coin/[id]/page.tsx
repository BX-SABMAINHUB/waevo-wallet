import dynamic from "next/dynamic";

// La importación dinámica con ssr: false es crucial para evitar errores de SSR
const HighchartsStockChart = dynamic(
  () => import("@/components/charts/HighchartsStockChart").then((mod) => mod.HighchartsStockChart),
  {
    ssr: false,
    loading: () => <div className="h-[400px] w-full animate-pulse rounded-xl bg-slate-800/50" />,
  }
);

interface CoinPageProps {
  params: Promise<{ id: string }>;
}

export default async function CoinPage({ params }: CoinPageProps) {
  const { id } = await params;

  return (
    <div className="aurora-bg min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold capitalize">
          {id.replace(/-/g, " ")}
        </h1>
        <div className="rounded-2xl glass p-4 md:p-6">
          <HighchartsStockChart coinId={id} />
        </div>
      </div>
    </div>
  );
}
