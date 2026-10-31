import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const coinId = searchParams.get("coin");
  const days = searchParams.get("days") || "1";

  if (!coinId) {
    return NextResponse.json({ error: "Falta el parámetro coin" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`,
      { next: { revalidate: 600 } } // Caché de 10 minutos
    );

    if (!res.ok) {
      throw new Error(`CoinGecko respondió con estado ${res.status}`);
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Error en API OHLCV:", error);
    return NextResponse.json({ error: "Error al obtener datos" }, { status: 500 });
  }
}
