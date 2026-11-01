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
      console.error('❌ Falta NOWNODES_API_KEY en las variables de entorno.');
      return NextResponse.json({ error: 'API Key de NOWNodes no configurada' }, { status: 500 });
    }

    if (!hostPrefix) {
      return NextResponse.json({ error: `La red ${upperSymbol} no está configurada.` }, { status: 400 });
    }

    const baseUrl = `https://${hostPrefix}.nownodes.io/api/v2`;

    // 🔥 CORRECCIÓN CRÍTICA: La API Key va en la cabecera 'api-key', NO en la URL.
    const headers = {
      'api-key': apiKey, // <-- Así lo exige NOWNodes
      'Accept': 'application/json',
    };

    // 1. Obtener la altura actual de la blockchain
    const statusUrl = `${baseUrl}/status`;
    const statusRes = await fetch(statusUrl, { headers, signal: AbortSignal.timeout(8000) });
    
    let currentBlock = 0;
    if (statusRes.ok) {
      const statusData = await statusRes.json();
      currentBlock = statusData.backend?.blocks || statusData.blockbook?.bestHeight || 0;
    } else {
      console.warn(`[NOWNodes] No se pudo obtener el estado de la red ${upperSymbol}`);
    }

    // 2. Obtener el saldo y las transacciones
    const addressUrl = `${baseUrl}/address/${address}?details=txs&pageSize=50`;
    const res = await fetch(addressUrl, { headers, signal: AbortSignal.timeout(10000) });

    if (!res.ok) {
      if (res.status === 404) {
        return NextResponse.json({ deposits: [], balance: '0' });
      }
      // Si vuelve a dar 401, el mensaje de error te lo dirá claramente
      if (res.status === 401) {
        throw new Error('La API Key de NOWNodes es inválida o ha sido rechazada. Revisa tu clave en Vercel.');
      }
      throw new Error(`NOWNodes respondió con estado ${res.status}`);
    }

    const data = await res.json();

    // 3. Calcular saldo
    const isEvm = ['ETH', 'MATIC', 'BNB'].includes(upperSymbol);
    const decimals = isEvm ? 18 : 8; 
    const balanceRaw = data.balance || '0';
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    // 4. Procesar transacciones
    const transactions = data.transactions || [];
    const deposits = [];

    for (const tx of transactions) {
      let isIncoming = false;
      let receivedValue = 0;

      // UTXO (Litecoin, Bitcoin...)
      if (tx.vout) {
        tx.vout.forEach((out: any) => {
          if (out.addresses?.includes(address)) {
            isIncoming = true;
            receivedValue += parseFloat(out.value || '0');
          }
        });
      } 
      // EVM (Ethereum, Polygon...)
      else if (tx.to?.toLowerCase() === address.toLowerCase()) {
        isIncoming = true;
        receivedValue = parseFloat(tx.value || '0');
      }

      if (!isIncoming || receivedValue <= 0) continue;

      const blockHeight = tx.blockHeight || tx.blockNumber || 0;
      let confirmations = 0;
      if (blockHeight > 0 && currentBlock > 0) {
        confirmations = currentBlock - blockHeight + 1;
      }

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

    deposits.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[NOWNodes] Éxito en ${upperSymbol}. Depósitos: ${deposits.length}. Saldo: ${balance}`);

    return NextResponse.json({ deposits, balance });

  } catch (error: any) {
    console.error('🔥 [Error en check-deposits - NOWNodes]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
