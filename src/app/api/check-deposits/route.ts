import { NextResponse } from 'next/server';

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
};

const UTXO_CHAINS = ['bitcoin-mainnet', 'litecoin-mainnet', 'doge-mainnet', 'bitcoin-cash-mainnet', 'cardano-mainnet'];

// Función para formatear el valor según la moneda
function formatValue(value: string | number, chain: string): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';
  
  // UTXO chains usan 8 decimales (satoshis, litoshis, etc.)
  if (UTXO_CHAINS.includes(chain)) {
    return (num / 1e8).toFixed(8);
  }
  // EVM chains usan 18 decimales (wei)
  if (chain === 'ethereum' || chain === 'polygon' || chain === 'bsc') {
    return (num / 1e18).toFixed(6);
  }
  // Solana usa 9 decimales (lamports)
  if (chain === 'solana') {
    return (num / 1e9).toFixed(6);
  }
  // Cardano usa 6 decimales
  if (chain === 'cardano-mainnet') {
    return (num / 1e6).toFixed(6);
  }
  return num.toString();
}

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = CHAIN_MAP[upperSymbol] || 'ethereum';

    let deposits: any[] = [];

    if (UTXO_CHAINS.includes(chain)) {
      // --- CONSULTA PARA CADENAS UTXO (Litecoin, Bitcoin, etc.) ---
      const url = new URL('https://api.tatum.io/v4/data/blockchains/transaction/history/utxos');
      url.searchParams.append('chain', chain);
      url.searchParams.append('address', address);
      url.searchParams.append('pageSize', '50');
      url.searchParams.append('offset', '0');
      url.searchParams.append('txType', 'incoming');

      const res = await fetch(url.toString(), {
        headers: { 'x-api-key': process.env.TATUM_API_KEY! },
      });

      if (res.ok) {
        const data = await res.json();
        deposits = (Array.isArray(data) ? data : data.data || []).map((tx: any) => {
          const confirmations = tx.confirmations || 0;
          // Consideramos confirmado si tiene al menos 1 confirmación (o 3 para más seguridad)
          const status = confirmations >= 1 ? 'confirmed' : 'pending';
          
          // Calcular el valor total recibido en esta dirección
          // Para UTXO, el valor puede estar en los outputs
          let totalValue = 0;
          if (tx.outputs && Array.isArray(tx.outputs)) {
            tx.outputs.forEach((out: any) => {
              if (out.address === address) {
                totalValue += parseFloat(out.value || 0);
              }
            });
          } else {
            totalValue = parseFloat(tx.value || 0);
          }

          return {
            symbol: upperSymbol,
            amount: formatValue(totalValue, chain),
            hash: tx.hash || tx.txId,
            status,
            confirmations,
            timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
          };
        });
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
        deposits = (data.data || []).map((tx: any) => {
          const confirmations = tx.confirmations || 0;
          const status = confirmations >= 1 ? 'confirmed' : 'pending';
          
          return {
            symbol: upperSymbol,
            amount: formatValue(tx.amount || tx.value || 0, chain),
            hash: tx.hash,
            status,
            confirmations,
            timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
          };
        });
      }
    }

    return NextResponse.json({ deposits });
  } catch (error: any) {
    console.error('Error en check-deposits:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
