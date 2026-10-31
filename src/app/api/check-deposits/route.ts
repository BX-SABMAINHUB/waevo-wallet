import { NextResponse } from 'next/server';

// Mapeo de símbolos a cadenas de Tatum (v4 usa nombres como "litecoin-mainnet")
const CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin-mainnet',
  LTC: 'litecoin-mainnet',
  DOGE: 'doge-mainnet',
  BCH: 'bitcoin-cash-mainnet',
  ETH: 'ethereum',
  MATIC: 'polygon',
  BSC: 'bsc',
  SOL: 'solana',
  ADA: 'cardano-mainnet',
  // Añade más según necesites
};

// Cadenas que usan el endpoint UTXO v4
const UTXO_CHAINS = ['bitcoin-mainnet', 'litecoin-mainnet', 'doge-mainnet', 'bitcoin-cash-mainnet', 'cardano-mainnet'];

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = CHAIN_MAP[upperSymbol] || 'ethereum'; // Fallback a Ethereum para tokens

    let deposits: any[] = [];

    if (UTXO_CHAINS.includes(chain)) {
      // --- CONSULTA PARA CADENAS UTXO (Litecoin, Bitcoin, etc.) ---
      const url = new URL('https://api.tatum.io/v4/data/blockchains/transaction/history/utxos');
      url.searchParams.append('chain', chain);
      url.searchParams.append('address', address);
      url.searchParams.append('pageSize', '50');
      url.searchParams.append('offset', '0');
      url.searchParams.append('txType', 'incoming'); // Solo transacciones entrantes

      const res = await fetch(url.toString(), {
        headers: { 'x-api-key': process.env.TATUM_API_KEY! },
      });

      if (res.ok) {
        const data = await res.json();
        // La respuesta v4 suele ser un array de transacciones
        deposits = (Array.isArray(data) ? data : data.data || []).map((tx: any) => ({
          symbol: upperSymbol,
          amount: tx.value || tx.amount || '0',
          hash: tx.hash || tx.txId,
          status: tx.confirmations > 0 ? 'confirmed' : 'pending',
          confirmations: tx.confirmations || 0,
          timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
        }));
      } else {
        const errorBody = await res.text();
        console.error(`Error UTXO v4 para ${chain}:`, errorBody);
      }
    } else {
      // --- CONSULTA PARA EVM (Ethereum, Polygon, BSC, etc.) ---
      const url = new URL('https://api.tatum.io/v4/data/transactions');
      url.searchParams.append('chain', chain);
      url.searchParams.append('addresses', address);
      url.searchParams.append('transactionSubtype', 'incoming');

      const res = await fetch(url.toString(), {
        headers: { 'x-api-key': process.env.TATUM_API_KEY! },
      });

      if (res.ok) {
        const data = await res.json();
        deposits = (data.data || []).map((tx: any) => ({
          symbol: upperSymbol,
          amount: tx.amount || tx.value || '0',
          hash: tx.hash,
          status: tx.confirmations > 0 ? 'confirmed' : 'pending',
          confirmations: tx.confirmations || 0,
          timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
        }));
      }
    }

    return NextResponse.json({ deposits });
  } catch (error: any) {
    console.error('Error en check-deposits:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
