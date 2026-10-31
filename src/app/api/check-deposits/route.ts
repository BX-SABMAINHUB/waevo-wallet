import { NextResponse } from 'next/server';

// Mapeo de símbolos a los nombres de cadena de Tatum v4 (formato: chain-mainnet)
const TATUM_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin-mainnet',
  LTC: 'litecoin-mainnet',
  DOGE: 'dogecoin-mainnet',
  BCH: 'bitcoin-cash-mainnet',
  ETH: 'ethereum-mainnet',
  MATIC: 'polygon-mainnet',
};

// Cadenas que usan el endpoint de historial de UTXOs en v4
const UTXO_CHAINS = ['bitcoin-mainnet', 'litecoin-mainnet', 'dogecoin-mainnet', 'bitcoin-cash-mainnet'];

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = TATUM_CHAIN_MAP[upperSymbol];
    const apiKey = process.env.TATUM_API_KEY;

    if (!chain) {
      return NextResponse.json({ error: `Red no soportada: ${upperSymbol}` }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de Tatum no configurada' }, { status: 500 });
    }

    // 1. Obtener la altura actual del bloque usando el endpoint v4
    console.log(`[CHECK-DEPOSITS] Obteniendo altura de ${chain} (v4)...`);
    const blockUrl = `https://api.tatum.io/v4/data/blockchains/block/current?chain=${chain}`;
    const blockRes = await fetch(blockUrl, {
      headers: { 'x-api-key': apiKey },
    });

    if (!blockRes.ok) {
      const errText = await blockRes.text();
      console.error(`[CHECK-DEPOSITS] Error en /block/current: ${blockRes.status} - ${errText}`);
      throw new Error(`Error Tatum (block): ${blockRes.status}`);
    }

    const blockData = await blockRes.json();
    // Intentamos extraer la altura de varias rutas posibles en la respuesta v4
    const currentBlock = blockData.height ?? blockData.data?.height ?? blockData.block?.height ?? blockData.number;
    
    if (typeof currentBlock !== 'number') {
      console.error(`[CHECK-DEPOSITS] Respuesta de /block/current inesperada:`, JSON.stringify(blockData));
      throw new Error('No se pudo obtener la altura del bloque actual');
    }

    console.log(`[CHECK-DEPOSITS] Altura actual: ${currentBlock}`);

    // 2. Obtener el historial de transacciones (solo para cadenas UTXO)
    if (!UTXO_CHAINS.includes(chain)) {
      console.log(`[CHECK-DEPOSITS] Omitiendo ${chain} (no es UTXO)`);
      return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
    }

    console.log(`[CHECK-DEPOSITS] Obteniendo transacciones de ${address} (v4)...`);
    const txUrl = new URL('https://api.tatum.io/v4/data/blockchains/transaction/history/utxos');
    txUrl.searchParams.append('chain', chain);
    txUrl.searchParams.append('address', address);
    txUrl.searchParams.append('pageSize', '50');
    // Filtramos solo transacciones entrantes para mayor eficiencia
    txUrl.searchParams.append('txType', 'incoming');

    const txRes = await fetch(txUrl.toString(), {
      headers: { 'x-api-key': apiKey },
    });

    // Si no hay transacciones, Tatum devuelve 404
    if (txRes.status === 404) {
      console.log(`[CHECK-DEPOSITS] Dirección sin transacciones.`);
      return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
    }

    if (!txRes.ok) {
      const errText = await txRes.text();
      console.error(`[CHECK-DEPOSITS] Error en /transaction/history/utxos: ${txRes.status} - ${errText}`);
      throw new Error(`Error Tatum (txs): ${txRes.status}`);
    }

    const txData = await txRes.json();
    // La respuesta v4 suele venir en `data` como un array de transacciones
    const transactions = Array.isArray(txData) ? txData : (txData.data || []);

    if (transactions.length === 0) {
      console.log(`[CHECK-DEPOSITS] No se encontraron transacciones.`);
      return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
    }

    console.log(`[CHECK-DEPOSITS] Transacciones encontradas: ${transactions.length}`);

    // 3. Procesar las transacciones
    const deposits = [];
    let totalConfirmedBalance = 0;

    for (const tx of transactions) {
      // En v4, el valor puede estar en `value` o `amount` (en la unidad mínima)
      const value = parseFloat(tx.value || tx.amount || 0);
      if (value <= 0) continue; // Ignorar si no hay valor positivo

      // Altura del bloque donde se incluyó la transacción
      const txBlock = tx.blockNumber || tx.blockHeight || 0;
      let confirmations = 0;
      if (txBlock > 0) {
        confirmations = currentBlock - txBlock + 1;
      }

      const status = confirmations >= 1 ? 'confirmed' : 'pending';
      const amount = (value / 1e8).toFixed(8); // Litecoin tiene 8 decimales

      if (status === 'confirmed') {
        totalConfirmedBalance += value / 1e8;
      }

      deposits.push({
        symbol: upperSymbol,
        amount,
        hash: tx.hash || tx.txId,
        status,
        confirmations,
        timestamp: tx.timestamp ? tx.timestamp * 1000 : (tx.time ? tx.time * 1000 : Date.now()),
      });
    }

    // Ordenar por fecha descendente
    deposits.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[CHECK-DEPOSITS] Depósitos procesados: ${deposits.length} | Saldo confirmado: ${totalConfirmedBalance.toFixed(8)} ${upperSymbol}`);

    return NextResponse.json({
      deposits,
      balance: totalConfirmedBalance.toFixed(8),
      currentBlockHeight: currentBlock,
    });

  } catch (error: any) {
    console.error('🔥 [ERROR CRÍTICO] en check-deposits (v4):', error.message);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' },
      { status: 500 }
    );
  }
}
