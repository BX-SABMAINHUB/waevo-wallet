import { NextResponse } from 'next/server';

const NATIVE_CHAINS: Record<string, string> = {
  BTC: 'bitcoin', LTC: 'litecoin', DOGE: 'dogecoin', BCH: 'bitcoin-cash',
  ADA: 'cardano', XRP: 'ripple', SOL: 'solana', DOT: 'polkadot',
  TRX: 'tron', XLM: 'stellar', XMR: 'monero', ZEC: 'zcash',
  DASH: 'dash', ETC: 'ethereum-classic', VET: 'vechain',
  ALGO: 'algorand', NEAR: 'near', ATOM: 'cosmos', FLOW: 'flow', EOS: 'eos',
};

// Función para generar un índice determinista a partir de userId + symbol
function getDeterministicIndex(userId: string, symbol: string): number {
  const hash = `${userId}-${symbol}`;
  let index = 0;
  for (let i = 0; i < hash.length; i++) {
    index = ((index << 5) - index) + hash.charCodeAt(i);
    index |= 0; // Convertir a entero de 32 bits
  }
  // Asegurar que sea positivo y dentro del rango de Tatum (máx 2^31-1)
  return Math.abs(index) % 2147483647;
}

export async function POST(request: Request) {
  try {
    const { symbol, userId } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    
    if (!upperSymbol || !userId) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const chain = NATIVE_CHAINS[upperSymbol] || 'ethereum';

    const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.TATUM_API_KEY! },
    });

    if (!walletRes.ok) {
      const err = await walletRes.text();
      throw new Error(`Tatum wallet error: ${walletRes.status} - ${err}`);
    }
    const walletData = await walletRes.json();

    if (walletData.xpub) {
      // Índice determinista: mismo usuario + misma moneda = misma dirección
      const index = getDeterministicIndex(userId, upperSymbol);

      const addressRes = await fetch(
        `https://api.tatum.io/v3/${chain}/address/${walletData.xpub}/${index}`,
        {
          method: 'GET',
          headers: { 'x-api-key': process.env.TATUM_API_KEY! },
        }
      );

      if (!addressRes.ok) {
        const err = await addressRes.text();
        throw new Error(`Tatum address error: ${addressRes.status} - ${err}`);
      }
      const { address } = await addressRes.json();
      return NextResponse.json({ address });

    } else if (walletData.address) {
      return NextResponse.json({ address: walletData.address });
    } else {
      throw new Error('Tatum no devolvió dirección');
    }

  } catch (error: any) {
    console.error('Error en API Tatum:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
