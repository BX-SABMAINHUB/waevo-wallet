import { NextResponse } from 'next/server';

// Mapeo de símbolos a cadenas (el mismo que usamos para generar direcciones)
const CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin', LTC: 'litecoin', DOGE: 'dogecoin', BCH: 'bitcoin-cash',
  ADA: 'cardano', XRP: 'ripple', SOL: 'solana', DOT: 'polkadot',
  TRX: 'tron', XLM: 'stellar', XMR: 'monero', ZEC: 'zcash',
  DASH: 'dash', ETC: 'ethereum-classic', VET: 'vechain',
  ALGO: 'algorand', NEAR: 'near', ATOM: 'cosmos', FLOW: 'flow', EOS: 'eos',
  // EVM y tokens
  ETH: 'ethereum', USDT: 'ethereum', USDC: 'ethereum', DAI: 'ethereum',
  LINK: 'ethereum', UNI: 'ethereum', SHIB: 'ethereum', PEPE: 'ethereum',
  MATIC: 'polygon', BNB: 'bsc', AVAX: 'avalanche-c-chain',
  FTM: 'fantom', ARB: 'arbitrum-one', OP: 'optimism', BASE: 'base',
};

// Cadenas que usan el endpoint v4/data/transactions (EVM)
const EVM_CHAINS = [
  'ethereum', 'polygon', 'bsc', 'avalanche-c-chain', 'fantom',
  'arbitrum-one', 'optimism', 'base', 'ethereum-classic'
];

// Cadenas que usan el endpoint v3/{chain}/transaction/address/{address} (UTXO)
const UTXO_CHAINS = ['bitcoin', 'litecoin', 'dogecoin', 'bitcoin-cash'];

export async function POST(request: Request) {
  try {
    const { wallets } = await request.json(); // [{ symbol, address }]
    if (!Array.isArray(wallets)) {
      return NextResponse.json({ error: 'Formato inválido' }, { status: 400 });
    }

    const deposits: any[] = [];
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    for (const { symbol, address } of wallets) {
      const upperSymbol = symbol?.toUpperCase();
      const chain = CHAIN_MAP[upperSymbol] || 'ethereum';

      try {
        let transactions: any[] = [];

        if (UTXO_CHAINS.includes(chain)) {
          // --- UTXO (Bitcoin, Litecoin, Dogecoin, Bitcoin Cash) ---
          const res = await fetch(
            `https://api.tatum.io/v3/${chain}/transaction/address/${address}`,
            { headers: { 'x-api-key': process.env.TATUM_API_KEY! } }
          );
          if (res.ok) {
            const data = await res.json();
            transactions = data.filter((tx: any) => 
              tx.outputs?.some((out: any) => out.address === address)
            );
          }
        } else if (EVM_CHAINS.includes(chain)) {
          // --- EVM (Ethereum, Polygon, BSC, etc.) ---
          const res = await fetch(
            `https://api.tatum.io/v4/data/transactions?chain=${chain}&addresses=${address}&transactionSubtype=incoming`,
            { headers: { 'x-api-key': process.env.TATUM_API_KEY! } }
          );
          if (res.ok) {
            const data = await res.json();
            transactions = data.data || [];
          }
        } else {
          // Otras cadenas (Solana, Cardano, etc.) -> usamos el endpoint v3 genérico
          const res = await fetch(
            `https://api.tatum.io/v3/${chain}/transaction/address/${address}`,
            { headers: { 'x-api-key': process.env.TATUM_API_KEY! } }
          );
          if (res.ok) {
            const data = await res.json();
            transactions = Array.isArray(data) ? data : [];
          }
        }

        // Filtrar transacciones recientes y determinar estado
        for (const tx of transactions) {
          const txTime = tx.timestamp ? tx.timestamp * 1000 : Date.now();
          if (txTime < sevenDaysAgo) continue;

          const confirmations = tx.confirmations ?? 0;
          const status = confirmations > 0 ? 'confirmed' : 'pending';

          deposits.push({
            symbol: upperSymbol,
            name: symbol,
            amount: tx.amount || tx.value || '0',
            hash: tx.hash || tx.txId,
            status,
            confirmations,
            timestamp: txTime,
          });
        }
      } catch (err) {
        console.error(`Error consultando ${upperSymbol}:`, err);
        // Continuamos con las demás monedas
      }
    }

    return NextResponse.json({ deposits });
  } catch (error: any) {
    console.error('Error en check-deposits:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
