import { NextResponse } from 'next/server';

// Mapeo de símbolos a los nombres de cadena de Tatum v3
const TATUM_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
  MATIC: 'polygon',
};

// Cadenas UTXO que usan el mismo formato en v3
const UTXO_CHAINS = ['bitcoin', 'litecoin', 'dogecoin', 'bitcoin-cash'];

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = TATUM_CHAIN_MAP[upperSymbol];
    const apiKey = process.env.TATUM_API_KEY;

    if (!chain || !UTXO_CHAINS.includes(chain)) {
      return NextResponse.json({ error: `Red no soportada: ${upperSymbol}` }, { status: 400 });
    }
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de Tatum no configurada' }, { status: 500 });
    }

    // 1. Obtener la altura actual del bloque usando v3 (/info)
    console.log(`[CHECK-DEPOSITS] Obteniendo altura de ${chain}...`);
    const infoRes = await fetch(`https://api.tatum.io/v3/${chain}/info`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!infoRes.ok) {
      const errText = await infoRes.text();
      console.error(`[CHECK-DEPOSITS] Error en /info: ${infoRes.status} - ${errText}`);
      throw new Error(`Error Tatum (info): ${infoRes.status}`);
    }

    const infoData = await infoRes.json();
    // La respuesta de v3 suele tener el campo 'blocks' o 'height'
    const currentBlock = infoData.blocks ?? infoData.height;
    
    if (typeof currentBlock !== 'number') {
      console.error(`[CHECK-DEPOSITS] Respuesta de /info inesperada:`, JSON.stringify(infoData));
      throw new Error('No se pudo obtener la altura del bloque actual (respuesta inválida)');
    }

    console.log(`[CHECK-DEPOSITS] Altura actual: ${currentBlock}`);

    // 2. Obtener las transacciones de la dirección (v3 sin pageSize)
    console.log(`[CHECK-DEPOSITS] Obteniendo transacciones de ${address}...`);
    const txRes = await fetch(`https://api.tatum.io/v3/${chain}/transaction/address/${address}`, {
      headers: { 'x-api-key': apiKey },
    });

    // Si la dirección no tiene transacciones, Tatum devuelve 404
    if (txRes.status === 404) {
      console.log(`[CHECK-DEPOSITS] Dirección sin transacciones.`);
      return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
    }

    if (!txRes.ok) {
      const errText = await txRes.text();
      console.error(`[CHECK-DEPOSITS] Error en /transaction/address: ${txRes.status} - ${errText}`);
      // Si el error es 400, puede ser por la dirección. Devolvemos vacío para no romper la UI.
      if (txRes.status === 400) {
        return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
      }
      throw new Error(`Error Tatum (txs): ${txRes.status}`);
    }

    const txData = await txRes.json();
    // v3 devuelve un array directamente, pero a veces puede venir envuelto en 'data'
    const transactions = Array.isArray(txData) ? txData : (txData.data || []);

    if (transactions.length === 0) {
      return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
    }

    console.log(`[CHECK-DEPOSITS] Transacciones encontradas: ${transactions.length}`);

    // 3. Procesar las transacciones
    const deposits = [];
    let totalConfirmedBalance = 0;

    for (const tx of transactions) {
      // Verificar si la dirección está en los outputs (es un ingreso)
      const isIncoming = tx.outputs?.some((out: any) => out.address === address);
      if (!isIncoming) continue;

      // Calcular valor recibido
      let receivedValue = 0;
      tx.outputs?.forEach((out: any) => {
        if (out.address === address) {
          receivedValue += parseFloat(out.value || 0);
        }
      });

      if (receivedValue <= 0) continue;

      // Calcular confirmaciones
      const txBlock = tx.blockNumber || 0;
      const confirmations = txBlock > 0 ? currentBlock - txBlock + 1 : 0;
      const status = confirmations >= 1 ? 'confirmed' : 'pending';

      // Formatear cantidad (8 decimales para UTXO)
      const amount = (receivedValue / 1e8).toFixed(8);

      if (status === 'confirmed') {
        totalConfirmedBalance += receivedValue / 1e8;
      }

      deposits.push({
        symbol: upperSymbol,
        amount,
        hash: tx.hash,
        status,
        confirmations,
        timestamp: tx.time ? tx.time * 1000 : Date.now(),
      });
    }

    // Ordenar por fecha descendente
    deposits.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({
      deposits,
      balance: totalConfirmedBalance.toFixed(8),
      currentBlockHeight: currentBlock,
    });

  } catch (error: any) {
    console.error('🔥 [ERROR CRÍTICO] en check-deposits:', error.message);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' },
      { status: 500 }
    );
  }
}
