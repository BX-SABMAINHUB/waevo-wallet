import CoinPageClient from "./CoinPageClient";

interface CoinPageProps {
  params: Promise<{ id: string }>;
}

export default async function CoinPage({ params }: CoinPageProps) {
  // Await porque es un Server Component
  const { id } = await params;

  return <CoinPageClient id={id} />;
}
