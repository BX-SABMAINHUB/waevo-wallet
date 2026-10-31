import { NextResponse } from 'next/server';

const NATIVE_CHAINS: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ADA: 'cardano',
  XRP: 'ripple',
  SOL: 'solana',
  DOT: 'polkadot',
  TRX: 'tron',
  XLM: 'stellar',
  XMR: 'monero',
  ZEC: 'zcash',
  DASH: 'dash',
  ETC: 'ethereum-classic',
  VET: 'vechain',
  ALGO: 'algorand',
  NEAR: 'near',
  ATOM: 'cosmos',
  FLOW: 'flow',
  EOS: 'eos',
};

export async function POST(request: Request) {
  try {
    const { symbol } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    
    // Si es una red nativa, usamos su cadena. Si es un token, usamos Ethereum.
    const chain = NATIVE_CHAINS[upperSymbol] || 'ethereum';

    const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.TATUM_API_KEY! },
    });

    if (!walletRes.ok) throw new Error('Error generando wallet en Tatum');
    const walletData = await walletRes.json();

    // Para que cada moneda tenga una dirección ÚNICA:
    // Si es una red nativa, usamos el timestamp. 
    // Si es un token, usamos un hash del símbolo para que sea determinista y único por moneda.
    let index: number;
    if (NATIVE_CHAINS[upperSymbol]) {
      index = Date.now();
    } else {
      // Generamos un número a partir del símbolo (ej. SHIB -> 123456)
      index = upperSymbol.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0) * 1000;
    }

    const addressRes = await fetch(
      `https://api.tatum.io/v3/${chain}/address/${walletData.xpub}/${index}`,
      {
        method: 'GET',
        headers: { 'x-api-key': process.env.TATUM_API_KEY! },
      }
    );

    if (!addressRes.ok) throw new Error('Error derivando dirección en Tatum');
    const { address } = await addressRes.json();

    return NextResponse.json({ address });
    
  } catch (error: any) {
    console.error('Error en API Tatum:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
