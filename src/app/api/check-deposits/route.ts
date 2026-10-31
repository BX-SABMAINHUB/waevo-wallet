import { NextResponse } from 'next/server';

// Mapeo de símbolos a los identificadores de cadena de Blockchair
const BLOCKCHAIR_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
  MATIC: 'polygon',
  DASH: 'dash',
  XRP: 'ripple',
  XLM: 'stellar',
  ZEC: 'zcash',
};

export async function POST(request: Request) {
  const startTime = Date.now();
  
  try {
    const body = await request.json();
    const { symbol, address } = body;

    console.log(`\n=== [CHECK-DEPOSITS] Verificando ${symbol} en ${address} ===`);

    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = BLOCKCHAIR_CHAIN_MAP[upperSymbol];

    if (!chain) {
      console.error(`❌ Red no soportada en Blockchair: ${upperSymbol}`);
      return NextResponse.json(
        { error: `Red ${upperSymbol} no soportada por Blockchair` },
        { status: 400 }
      );
    }

    // 🔴 CRÍTICO: transaction_details=true es OBLIGATORIO para obtener los objetos de transacción
    const url = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${address}`);
    url.searchParams.append('transaction_details', 'true');
    url.searchParams.append('limit', '20');

    console.log(`📡 Consultando: ${url.toString()}`);

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    // Manejo de límite de peticiones
    if (res.status === 402) {
      console.error('❌ Límite de peticiones de Blockchair excedido (402)');
      return NextResponse.json(
        { error: 'Límite de consultas excedido. Espera un minuto e inténtalo de nuevo.' },
        { status: 429 }
      );
    }

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`❌ Blockchair error ${res.status}:`, errorText);
      throw new Error(`Blockchair respondió ${res.status}: ${errorText.substring(0, 200)}`);
    }

    const data = await res.json();
    
    // Verificar que la respuesta tenga la estructura esperada
    const addressData = data.data?.[address];
    if (!addressData) {
      console.warn(`⚠️ Dirección no encontrada en Blockchair: ${address}`);
      return NextResponse.json({ 
        deposits: [], 
        balance: '0',
        message: 'Dirección sin actividad en la blockchain' 
      });
    }

    console.log(`✅ Respuesta de Blockchair recibida. Altura actual: ${data.context?.state}`);

    // Obtener saldo y decimales
    const balanceRaw = addressData.address?.balance || '0';
    const decimals = (chain === 'ethereum' || chain === 'polygon') ? 18 : 8;
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    // Altura actual de la blockchain para calcular confirmaciones
    const currentBlockHeight = data.context?.state;
    if (typeof currentBlockHeight !== 'number') {
      throw new Error('No se pudo obtener la altura de la blockchain');
    }

    // Procesar transacciones
    const rawTxs = addressData.transactions || [];
    console.log(`📋 Transacciones encontradas: ${rawTxs.length}`);

    // Filtrar y procesar SOLO las transacciones entrantes (balance_change positivo)
    const deposits = rawTxs
      .filter((tx: any) => {
        const change = parseFloat(tx.balance_change || '0');
        // Solo transacciones que aumentaron el saldo (ingresos)
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
    deposits.forEach((d: any) => {
      console.log(`  → ${d.amount} ${d.symbol} | Confirmaciones: ${d.confirmations} | ${d.status} | Hash: ${d.hash.substring(0, 16)}...`);
    });

    const duration = Date.now() - startTime;
    console.log(`⏱️ Completado en ${duration}ms\n`);

    return NextResponse.json({
      deposits,
      balance,
      currentBlockHeight,
    });

  } catch (error: any) {
    console.error('🔥 [Error Crítico] en check-deposits:', error.message);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' },
      { status: 500 }
    );
  }
}
