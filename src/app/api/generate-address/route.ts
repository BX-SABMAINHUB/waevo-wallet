import { NextResponse } from 'next/server';

const NATIVE_CHAINS: Record<string, string> = {
  BTC: 'bitcoin', LTC: 'litecoin', DOGE: 'dogecoin', BCH: 'bitcoin-cash',
  ADA: 'cardano', XRP: 'ripple', SOL: 'solana', DOT: 'polkadot',
  TRX: 'tron', XLM: 'stellar', XMR: 'monero', ZEC: 'zcash',
  DASH: 'dash', ETC: 'ethereum-classic', VET: 'vechain',
  ALGO: 'algorand', NEAR: 'near', ATOM: 'cosmos', FLOW: 'flow', EOS: 'eos',
};

function getDeterministicIndex(userId: string, symbol: string): number {
  const hash = `${userId}-${symbol}`;
  let index = 0;
  for (let i = 0; i < hash.length; i++) {
    index = ((index << 5) - index) + hash.charCodeAt(i);
    index |= 0;
  }
  return Math.abs(index) % 2147483647;
}

export async function POST(request: Request) {
  try {
    const { symbol, userId, xpub: existingXpub } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    
    if (!upperSymbol || !userId) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const chain = NATIVE_CHAINS[upperSymbol] || 'ethereum';
    let xpub = existingXpub;

    // Si no tenemos una xpub guardada, generamos una nueva
    if (!xpub) {
      const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
        method: 'GET',
        headers: { 'x-api-key': process.env.TATUM_API_KEY! },
      });
      if (!walletRes.ok) throw new Error('Error generando wallet en Tatum');
      const walletData = await walletRes.json();
      xpub = walletData.xpub;
    }

    if (xpub) {
      // Derivamos la dirección usando el índice determinista
      const index = getDeterministicIndex(userId, upperSymbol);

      const addressRes = await fetch(
        `https://api.tatum.io/v3/${chain}/address/${xpub}/${index}`,
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
      return NextResponse.json({ address, xpub }); // Devolvemos la xpub
    }

    throw new Error('Tatum no devolvió una xpub válida');
  } catch (error: any) {
    console.error('Error en API Tatum:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
