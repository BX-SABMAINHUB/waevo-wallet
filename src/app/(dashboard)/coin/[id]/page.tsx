import CoinPageClient from "./CoinPageClient";

interface CoinPageProps {
  params: Promise<{ id: string }>;
}

export default async function CoinPage({ params }: CoinPageProps) {
  // En Next.js 15, params es una promesa, por lo que debemos usar await
  const { id } = await params;

  // Renderizamos el componente cliente pasándole el ID
  return <CoinPageClient id={id} />;
}
