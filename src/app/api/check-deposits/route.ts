import { NextResponse } from 'next/server';

// ============================================================================
// CONFIGURACIÓN DE GETBLOCK
// ============================================================================
// Mapeo de símbolos a los slugs de red de GetBlock
const GETBLOCK_CHAIN_MAP: Record<string, string> = {
  // Redes UTXO
  BTC: 'btc',
  LTC: 'ltc',
  DOGE: 'doge',
  BCH: 'bch',
  DASH: 'dash',
  ZEC: 'zec',
  // Redes EVM (la lógica de consulta sería similar)
  ETH: 'eth',
  MATIC: 'polygon',
  BNB: 'bsc',
};

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chainSlug = GETBLOCK_CHAIN_MAP[upperSymbol];
    const apiKey = process.env.GETBLOCK_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de GetBlock no configurada' }, { status: 500 });
    }
    if (!chainSlug) {
      return NextResponse.json({ error: `La red ${upperSymbol} no está configurada.` }, { status: 400 });
    }

    // GetBlock usa una URL base unificada con el slug de la red
    const rpcUrl = `https://${chainSlug}.getblock.io/mainnet/`;
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    };

    // 1. Obtener el saldo de la dirección (para UTXO)
    const balancePayload = {
      jsonrpc: '2.0',
      method: 'getaddressbalance', // Método estándar para UTXO
      params: [{ addresses: [address] }],
      id: 1,
    };

    const balanceRes = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(balancePayload),
      signal: AbortSignal.timeout(8000),
    });

    if (!balanceRes.ok) {
        const errText = await balanceRes.text();
        console.error(`[GetBlock] Error en balance: ${balanceRes.status} - ${errText}`);
        throw new Error(`GetBlock respondió con estado ${balanceRes.status}`);
    }

    const balanceData = await balanceRes.json();
    const rawBalance = balanceData.result?.balance || 0;
    const decimals = 8; // UTXO usa 8 decimales
    const balance = (rawBalance / Math.pow(10, decimals)).toFixed(8);

    // 2. Obtener las transacciones recientes
    const txPayload = {
      jsonrpc: '2.0',
      method: 'getaddresstxids', // Método para obtener hashes de transacciones
      params: [{ addresses: [address], limit: 50 }],
      id: 2,
    };

    const txRes = await fetch(rpcUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(txPayload),
      signal: AbortSignal.timeout(10000),
    });

    if (!txRes.ok) {
        throw new Error(`GetBlock respondió con estado ${txRes.status} en transacciones`);
    }

    const txData = await txRes.json();
    const txids = txData.result || [];
    const deposits = [];

    // 3. Para cada transacción, obtener los detalles y filtrar los ingresos
    for (const txid of txids) {
      const detailPayload = {
        jsonrpc: '2.0',
        method: 'getrawtransaction',
        params: [txid, 1], // 1 = verbose (devuelve JSON)
        id: 3,
      };

      const detailRes = await fetch(rpcUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(detailPayload),
      });
      
      if (!detailRes.ok) continue;
      
      const detailData = await detailRes.json();
      const tx = detailData.result;
      if (!tx) continue;

      // Buscar si nuestra dirección está en los outputs (ingreso)
      let receivedValue = 0;
      if (tx.vout) {
        for (const out of tx.vout) {
          if (out.scriptPubKey?.addresses?.includes(address)) {
            receivedValue += out.value; // El valor ya viene en la unidad principal
          }
        }
      }

      if (receivedValue > 0) {
        const confirmations = tx.confirmations || 0;
        const status = confirmations >= 1 ? 'confirmed' : 'pending';
        
        deposits.push({
          symbol: upperSymbol,
          amount: receivedValue.toFixed(8),
          hash: txid,
          status,
          confirmations,
          timestamp: tx.time ? tx.time * 1000 : Date.now(),
        });
      }
    }

    // Ordenar por fecha descendente
    deposits.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ deposits, balance });

  } catch (error: any) {
    console.error('🔥 [Error en check-deposits - GetBlock]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
