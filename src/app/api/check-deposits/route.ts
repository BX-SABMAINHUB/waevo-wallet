import { NextResponse } from 'next/server';

const BLOCKCHAIR_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
  MATIC: 'polygon',
};

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = BLOCKCHAIR_CHAIN_MAP[upperSymbol];

    if (!chain) {
      return NextResponse.json({ error: `Red no soportada: ${upperSymbol}` }, { status: 400 });
    }

    // 1. Obtener el dashboard con transaction_details=false
    const url = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${address}`);
    url.searchParams.append('transaction_details', 'false');
    url.searchParams.append('limit', '50');

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (res.status === 402) {
        return NextResponse.json({ error: 'Límite de consultas excedido. Espera un minuto.' }, { status: 429 });
      }
      throw new Error(`Blockchair respondió ${res.status}`);
    }

    const data = await res.json();
    const addressData = data.data?.[address];

    if (!addressData) {
      return NextResponse.json({ deposits: [], balance: '0' });
    }

    const currentBlockHeight = data.context?.state;
    if (typeof currentBlockHeight !== 'number') {
      throw new Error('No se pudo obtener la altura de la blockchain');
    }

    const balanceRaw = addressData.address?.balance || '0';
    const decimals = (chain === 'ethereum' || chain === 'polygon') ? 18 : 8;
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    // 2. Obtener la lista de hashes y consultar los detalles de cada uno
    const txHashes = addressData.transactions || [];
    const deposits = [];

    // Limitamos a las últimas 10 transacciones para no saturar la API de Blockchair
    for (const hash of txHashes.slice(0, 10)) {
      try {
        const txUrl = `https://api.blockchair.com/${chain}/dashboards/transaction/${hash}`;
        const txRes = await fetch(txUrl, {
          headers: { 'Accept': 'application/json' },
        });

        if (!txRes.ok) continue;

        const txData = await txRes.json();
        const txDetails = txData.data?.[hash]?.transaction;
        if (!txDetails) continue;

        // Si el balance_change es negativo, es un pago que tú hiciste, no un ingreso
        const change = parseFloat(txDetails.balance_change || '0');
        if (change <= 0) continue;

        const blockId = txDetails.block_id;
        let confirmations = 0;
        if (typeof blockId === 'number' && blockId > 0) {
          confirmations = currentBlockHeight - blockId + 1;
        }

        const status = confirmations >= 1 ? 'confirmed' : 'pending';
        const amount = (change / Math.pow(10, decimals)).toFixed(8);

        deposits.push({
          symbol: upperSymbol,
          amount: amount,
          hash: hash,
          status,
          confirmations,
          timestamp: txDetails.time ? new Date(txDetails.time).getTime() : Date.now(),
        });

        // Pequeña pausa para no exceder el límite de peticiones de Blockchair
        await new Promise(r => setTimeout(r, 150));

      } catch (err) {
        console.error(`Error consultando tx ${hash}:`, err);
      }
    }

    // Ordenar por fecha descendente
    deposits.sort((a: any, b: any) => b.timestamp - a.timestamp);

    return NextResponse.json({
      deposits,
      balance,
      currentBlockHeight,
    });

  } catch (error: any) {
    console.error('Error en check-deposits:', error.message);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
