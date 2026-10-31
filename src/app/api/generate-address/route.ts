import { NextResponse } from 'next/server';

// Mapeo de símbolos a las redes nativas soportadas por Tatum
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
    
    if (!upperSymbol) {
      return NextResponse.json({ error: 'Símbolo de moneda no proporcionado' }, { status: 400 });
    }

    // Si es una red nativa, usamos su cadena. Si es un token (SHIB, PEPE, USDT...), usamos Ethereum.
    const chain = NATIVE_CHAINS[upperSymbol] || 'ethereum';

    // 1. Generar la wallet en Tatum
    const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.TATUM_API_KEY! },
    });

    if (!walletRes.ok) {
      const errorBody = await walletRes.text();
      console.error(`Error generando wallet para ${chain}:`, errorBody);
      throw new Error(`Tatum error (wallet): ${walletRes.status}`);
    }
    
    const walletData = await walletRes.json();

    // 2. Lógica para obtener la dirección final
    if (walletData.xpub) {
      // --- Caso A: La red soporta xpub (Bitcoin, Ethereum, Litecoin...) ---
      // Generamos un índice único y determinista basado en el símbolo de la moneda.
      // Así, USDT siempre tendrá una dirección y SHIB tendrá otra distinta.
      const index = upperSymbol.split('').reduce((acc: number, char: string) => acc + char.charCodeAt(0), 0);

      const addressRes = await fetch(
        `https://api.tatum.io/v3/${chain}/address/${walletData.xpub}/${index}`,
        {
          method: 'GET',
          headers: { 'x-api-key': process.env.TATUM_API_KEY! },
        }
      );

      if (!addressRes.ok) {
        const errorBody = await addressRes.text();
        console.error(`Error derivando dirección para ${chain} (Índice: ${index}):`, errorBody);
        throw new Error(`Tatum error (address): ${addressRes.status}`);
      }
      
      const { address } = await addressRes.json();
      return NextResponse.json({ address });

    } else if (walletData.address) {
      // --- Caso B: La red devuelve una dirección directa (Solana, Algorand...) ---
      // Usamos directamente la dirección de la wallet generada.
      return NextResponse.json({ address: walletData.address });

    } else {
      throw new Error('Tatum no devolvió ni xpub ni address');
    }

  } catch (error: any) {
    console.error('Error en API Tatum:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno generando dirección' }, 
      { status: 500 }
    );
  }
}
