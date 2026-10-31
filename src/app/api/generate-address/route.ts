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
  EOS: 'eos'
};

export async function POST(request: Request) {
  try {
    const { symbol } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    
    // 1. Identificamos si es una red EVM (para usar la dirección de Privy)
    const evmNetworks = ['ETH', 'BNB', 'MATIC', 'AVAX', 'FTM', 'ARB', 'OP', 'BASE', 'USDT', 'USDC', 'DAI', 'LINK', 'UNI', 'SHIB', 'PEPE'];
    
    // 2. Buscamos la cadena en Tatum
    const chain = TATUM_CHAIN_MAP[upperSymbol];

    // Si es EVM o una moneda no soportada por Tatum, le decimos al frontend que use Privy
    if (evmNetworks.includes(upperSymbol) || !chain) {
       return NextResponse.json({ isEvm: true, address: null });
    }

    // Si es una red independiente (BTC, SOL, etc.), llamamos a Tatum
    const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.TATUM_API_KEY! },
    });

    if (!walletRes.ok) throw new Error('Error generando wallet en Tatum');
    const walletData = await walletRes.json();

    // Derivar dirección usando el timestamp para que sea única
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

    return NextResponse.json({ isEvm: false, address });
    
  } catch (error: any) {
    console.error('Error en API Tatum:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
