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
  const startTime = Date.now();
  console.log(`\n[CHECK-DEPOSITS] Iniciando verificación con Blockchair...`);

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

    console.log(`🔍 Consultando ${chain} para: ${address}`);

    // transaction_details=true es OBLIGATORIO para obtener los objetos de transacción
    const url = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${address}`);
    url.searchParams.append('transaction_details', 'true');
    url.searchParams.append('limit', '20');

    console.log(`📡 Petición: ${url.toString()}`);

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000) // Timeout de 10s
    });

    if (!res.ok) {
      if (res.status === 402) {
        console.error('❌ Límite de peticiones a Blockchair excedido (402)');
        return NextResponse.json({ error: 'Límite de consultas excedido. Espera un minuto.' }, { status: 429 });
      }
      const errorText = await res.text();
      console.error(`❌ Blockchair error ${res.status}:`, errorText);
      throw new Error(`Blockchair respondió ${res.status}`);
    }

    const data = await res.json();
    const addressData = data.data?.[address];

    if (!addressData) {
      console.warn(`⚠️ Dirección no encontrada en Blockchair: ${address}`);
      return NextResponse.json({ deposits: [], balance: '0' });
    }

    const currentBlockHeight = data.context?.state;
    if (typeof currentBlockHeight !== 'number') {
      throw new Error('No se pudo obtener la altura de la blockchain');
    }

    console.log(`✅ Altura actual: ${currentBlockHeight}`);

    const balanceRaw = addressData.address?.balance || '0';
    const decimals = (chain === 'ethereum' || chain === 'polygon') ? 18 : 8;
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    const rawTxs = addressData.transactions || [];
    console.log(`📋 Transacciones encontradas: ${rawTxs.length}`);

    // Filtramos solo las transacciones entrantes (balance_change > 0)
    const deposits = rawTxs
      .filter((tx: any) => {
        const change = parseFloat(tx.balance_change || '0');
        return change > 0;
      })
      .map((tx: any) => {
        const blockId = tx.block_id;
        let confirmations = 0;

        if (typeof blockId === 'number' && blockId > 0) {
          confirmations = currentBlockHeight - blockId + 1;
        }

        const status = confirmations >= 1 ? 'confirmed' : 'pending';
        const valueRaw = parseFloat(tx.balance_change || '0');
        const amount = (valueRaw / Math.pow(10, decimals)).toFixed(8);

        return {
          symbol: upperSymbol,
          amount: amount,
          hash: tx.hash,
          status,
          confirmations,
          timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
        };
      })
      .sort((a: any, b: any) => b.timestamp - a.timestamp);

    console.log(`💰 Depósitos procesados: ${deposits.length}`);

    const duration = Date.now() - startTime;
    console.log(`⏱️ Completado en ${duration}ms\n`);

    return NextResponse.json({
      deposits,
      balance,
      currentBlockHeight,
    });

  } catch (error: any) {
    console.error('🔥 [Error Crítico] en check-deposits:', error.message);
    return NextResponse.json({ error: error.message || 'Error interno verificando depósitos' }, { status: 500 });
  }
}
