import { NextResponse } from 'next/server';

// Mapeo exhaustivo de símbolos a las redes de Tatum
const TATUM_CHAIN_MAP: Record<string, string> = {
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
  // Redes EVM y Tokens
  ETH: 'ethereum',
  USDT: 'ethereum',
  USDC: 'ethereum',
  DAI: 'ethereum',
  LINK: 'ethereum',
  UNI: 'ethereum',
  SHIB: 'ethereum',
  PEPE: 'ethereum',
  MATIC: 'polygon',
  BNB: 'bsc',
  AVAX: 'avalanche-c-chain',
  FTM: 'fantom',
  ARB: 'arbitrum-one',
  OP: 'optimism',
  BASE: 'base'
};

export async function POST(request: Request) {
  try {
    const { symbol } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    
    // Buscamos la cadena en Tatum. Si no está, usamos 'ethereum' como fallback.
    const chain = TATUM_CHAIN_MAP[upperSymbol] || 'ethereum';

    // 1. Generar una wallet HD (xpub) para esta cadena
    const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.TATUM_API_KEY! },
    });

    if (!walletRes.ok) throw new Error('Error generando wallet en Tatum');
    const walletData = await walletRes.json();

    // 2. Derivar una dirección ÚNICA usando el timestamp actual como índice.
    // Esto garantiza que cada vez que pidas una dirección para USDT o ETH, sea diferente.
    const index = Date.now();
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
