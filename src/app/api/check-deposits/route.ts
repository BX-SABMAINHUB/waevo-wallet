import { NextResponse } from 'next/server';

// Mapeo de símbolos a los nombres de cadena que usa Tatum en su API v4
const TATUM_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin-mainnet',
  LTC: 'litecoin-mainnet',
  DOGE: 'dogecoin-mainnet',
  BCH: 'bitcoin-cash-mainnet',
  ETH: 'ethereum',
  MATIC: 'polygon',
};

// Cadenas UTXO que usan el endpoint de historial de transacciones v4
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

    // 1. Obtener la altura actual de la blockchain (endpoint v4)
    const infoRes = await fetch(`https://api.tatum.io/v4/data/blockchains/block/current?chain=${chain}`, {
      headers: { 'x-api-key': apiKey },
    });
    if (!infoRes.ok) throw new Error(`Error obteniendo altura del bloque: ${infoRes.status}`);
    const infoData = await infoRes.json();
    const currentBlock = infoData.height; // La v4 devuelve 'height'
    if (typeof currentBlock !== 'number') throw new Error('Altura de bloque inválida');

    // 2. Obtener el historial de transacciones de la dirección (endpoint v4)
    let transactions = [];
    if (UTXO_CHAINS.includes(chain)) {
      // Endpoint v4 para historial de UTXO
      const url = new URL('https://api.tatum.io/v4/data/blockchains/transaction/history/utxos');
      url.searchParams.append('chain', chain);
      url.searchParams.append('address', address);
      url.searchParams.append('pageSize', '50'); // Límite de transacciones a revisar

      const txRes = await fetch(url.toString(), { headers: { 'x-api-key': apiKey } });
      
      if (txRes.status === 404) {
        return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
      }
      if (!txRes.ok) {
        const errText = await txRes.text();
        throw new Error(`Error en Tatum v4: ${txRes.status} - ${errText}`);
      }
      const txData = await txRes.json();
      transactions = txData.data || []; // La v4 devuelve los datos en 'data'
    } else {
        // (Omitimos EVM por simplicidad, pero se podría añadir aquí)
        return NextResponse.json({ deposits: [], balance: '0' });
    }

    // 3. Procesar las transacciones
    const deposits = [];
    let totalConfirmedBalance = 0;

    for (const tx of transactions) {
      // En v4, el valor para UTXO se encuentra en 'value' (en la unidad mínima)
      // y el bloque en 'blockNumber'. Si no hay blockNumber, está pendiente.
      const blockHeight = tx.blockNumber;
      let confirmations = 0;
      if (typeof blockHeight === 'number' && blockHeight > 0) {
        confirmations = currentBlock - blockHeight + 1;
      }
      
      // Solo consideramos transacciones que nos han enviado (valor positivo)
      // La v4 ya filtra por 'incoming' si se especifica, pero aquí verificamos.
      const value = parseFloat(tx.value || 0);
      if (value <= 0) continue;

      const status = confirmations >= 1 ? 'confirmed' : 'pending';
      const amount = (value / 1e8).toFixed(8); // Litecoin tiene 8 decimales

      if (status === 'confirmed') {
        totalConfirmedBalance += value / 1e8;
      }

      deposits.push({
        symbol: upperSymbol,
        amount,
        hash: tx.hash,
        status,
        confirmations,
        timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
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
    console.error('🔥 [Error Crítico] en check-deposits (v4):', error.message);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' },
      { status: 500 }
    );
  }
}
