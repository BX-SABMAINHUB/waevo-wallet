import { NextResponse } from 'next/server';

const BLOCKCHAIR_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
  MATIC: 'polygon',
};

// Caché en memoria para evitar llamadas repetitivas a Blockchair
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // Los datos se guardan durante 60 segundos

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

    const cacheKey = `${chain}-${address}`;
    const cached = cache.get(cacheKey);

    // 1. Devolver datos desde la caché si son recientes
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      console.log(`[Caché] Devolviendo datos guardados para ${cacheKey}`);
      return NextResponse.json(cached.data);
    }

    console.log(`[Blockchair] Consultando red ${chain} para: ${address}`);

    // 2. Consultar a Blockchair con los parámetros correctos
    const url = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${address}`);
    url.searchParams.append('transaction_details', 'true');
    url.searchParams.append('limit', '50');

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });

    // 3. Manejo específico del error 430 (IP bloqueada temporalmente)
    if (res.status === 430) {
      console.error('❌ Error 430: IP bloqueada temporalmente por Blockchair.');
      return NextResponse.json({ 
        error: 'Blockchair ha bloqueado temporalmente la IP por exceso de peticiones. Por favor, espera 1 o 2 minutos antes de volver a intentarlo.' 
      }, { status: 429 });
    }

    if (!res.ok) {
      throw new Error(`Blockchair respondió con estado ${res.status}`);
    }

    const json = await res.json();
    const addressData = json.data?.[address];

    if (!addressData) {
      const emptyResult = { deposits: [], balance: '0' };
      cache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
      return NextResponse.json(emptyResult);
    }

    const currentBlockHeight = json.context?.state;
    if (typeof currentBlockHeight !== 'number') {
      throw new Error('No se pudo obtener la altura de la blockchain');
    }

    const balanceRaw = addressData.address?.balance || '0';
    const decimals = (chain === 'ethereum' || chain === 'polygon') ? 18 : 8;
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    const rawTxs = addressData.transactions || [];
    const deposits = [];

    for (const tx of rawTxs) {
      const balanceChange = parseFloat(tx.balance_change || '0');
      if (balanceChange <= 0) continue;

      const blockId = tx.block_id;
      let confirmations = 0;
      if (typeof blockId === 'number' && blockId > 0) {
        confirmations = currentBlockHeight - blockId + 1;
      }

      deposits.push({
        symbol: upperSymbol,
        amount: (balanceChange / Math.pow(10, decimals)).toFixed(8),
        hash: tx.hash,
        status: confirmations >= 1 ? 'confirmed' : 'pending',
        confirmations,
        timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
      });
    }

    deposits.sort((a, b) => b.timestamp - a.timestamp);

    const result = { deposits, balance, currentBlockHeight };

    // 4. Guardar en caché para la próxima petición
    cache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('🔥 [Error en check-deposits]:', error.message);
    return NextResponse.json({ error: error.message || 'Error consultando la red' }, { status: 500 });
  }
}
