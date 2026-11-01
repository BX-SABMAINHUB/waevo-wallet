import { NextResponse } from 'next/server';

// ============================================================================
// CONFIGURACIÓN DE NOWNODES
// ============================================================================
const NOWNODES_HOSTS: Record<string, string> = {
  BTC: 'btcbook',
  LTC: 'ltcbook',
  DOGE: 'dogebook',
  BCH: 'bchbook',
  DASH: 'dashbook',
  ZEC: 'zecbook',
  ETH: 'eth-blockbook',
  MATIC: 'polygon-blockbook',
  BNB: 'bsc-blockbook',
};

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const hostPrefix = NOWNODES_HOSTS[upperSymbol];
    const apiKey = process.env.NOWNODES_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de NOWNodes no configurada' }, { status: 500 });
    }
    if (!hostPrefix) {
      return NextResponse.json({ error: `La red ${upperSymbol} no está configurada.` }, { status: 400 });
    }

    const baseUrl = `https://${hostPrefix}.nownodes.io/api/v2`;
    const headers = {
      'api-key': apiKey,
      'Accept': 'application/json',
    };

    // 1. Obtener la información de la dirección CON transacciones detalladas
    const addressUrl = `${baseUrl}/address/${address}?details=txs&pageSize=50`;
    console.log(`[NOWNodes] Consultando: ${addressUrl}`);
    
    const res = await fetch(addressUrl, { headers, signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ deposits: [], balance: '0' });
      }
      const errorText = await res.text();
      console.error(`[NOWNodes] Error ${res.status}:`, errorText);
      throw new Error(`NOWNodes respondió con estado ${res.status}`);
    }

    const data = await res.json();
    
    // 🔥 LOG CRÍTICO: Imprimimos la respuesta completa para depuración
    console.log('[NOWNodes] Respuesta completa de la API:', JSON.stringify(data, null, 2));

    // 2. Calcular saldo
    const isEvm = ['ETH', 'MATIC', 'BNB'].includes(upperSymbol);
    const decimals = isEvm ? 18 : 8; 
    const balanceRaw = data.balance || '0';
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    // 3. Procesar transacciones
    const transactions = data.transactions || [];
    const deposits = [];

    console.log(`[NOWNodes] Transacciones encontradas en la respuesta: ${transactions.length}`);

    for (const tx of transactions) {
      let receivedValue = 0;

      // 🔥 CORRECCIÓN: Usamos el array 'vout' para TODAS las redes (UTXO y EVM)
      if (tx.vout) {
        for (const out of tx.vout) {
          // Comprobamos si nuestra dirección está en la lista de direcciones del output
          if (out.addresses && out.addresses.includes(address)) {
            receivedValue += parseFloat(out.value || '0');
          }
        }
      }

      // Si no se recibió nada en esta dirección, ignoramos la transacción
      if (receivedValue <= 0) {
        continue;
      }

      // 🔥 CORRECCIÓN: Usamos el campo 'confirmations' directamente de la respuesta
      const confirmations = tx.confirmations || 0;
      const status = confirmations >= 1 ? 'confirmed' : 'pending';
      const amount = (receivedValue / Math.pow(10, decimals)).toFixed(8);

      deposits.push({
        symbol: upperSymbol,
        amount: amount,
        hash: tx.txid || tx.hash,
        status,
        confirmations,
        timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
      });
    }

    // Ordenar por fecha descendente (más reciente primero)
    deposits.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[NOWNodes] Depósitos procesados para ${upperSymbol}:`, deposits);

    return NextResponse.json({ deposits, balance });

  } catch (error: any) {
    console.error('🔥 [Error en check-deposits - NOWNodes]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
