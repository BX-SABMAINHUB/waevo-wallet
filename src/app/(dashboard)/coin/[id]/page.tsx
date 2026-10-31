import { HighchartsStockChart } from "@/components/charts/HighchartsStockChart";

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
          {/* El componente del gráfico es un Client Component */}
          <HighchartsStockChart coinId={id} />
        </div>
      </div>
    </div>
  );
}
