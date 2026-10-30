import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const coinId = searchParams.get("coin"); // ej: "bitcoin"
  const days = searchParams.get("days") || "1";

  // CoinGecko: plan gratuito permite 10k llamadas/mes y 100 req/min[reference:5]
  const res = await fetch(
    `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
    { next: { revalidate: 600 } } // caché de 10 minutos
  );
  const data = await res.json();
  return NextResponse.json(data);
}
