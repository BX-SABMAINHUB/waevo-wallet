import { NextResponse } from 'next/server';

// Mapeo de símbolos a las redes de Blockchair
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

    console.log(`[Blockchair] Verificando ${chain} para la dirección: ${address}`);

    // transaction_details=true es vital para obtener los objetos con block_id y balance_change
    const url = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${address}`);
    url.searchParams.append('transaction_details', 'true');
    url.searchParams.append('limit', '50'); // Límite seguro

    const res = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000), // Timeout de 10s
    });

    if (!res.ok) {
      if (res.status === 402 || res.status === 429) {
        return NextResponse.json({ error: 'Límite de consultas a Blockchair excedido. Espera un minuto.' }, { status: 429 });
      }
      throw new Error(`Blockchair respondió con estado ${res.status}`);
    }

    const json = await res.json();
    const addressData = json.data?.[address];

    if (!addressData) {
      // La dirección no tiene actividad o no existe en la red
      return NextResponse.json({ deposits: [], balance: '0' });
    }

    // 1. Obtener altura actual de la red para calcular confirmaciones
    const currentBlockHeight = json.context?.state;
    if (typeof currentBlockHeight !== 'number') {
      throw new Error('No se pudo obtener la altura de la blockchain');
    }

    // 2. Calcular saldo total (en la unidad mínima, ej. satoshis)
    const balanceRaw = addressData.address?.balance || '0';
    // 8 decimales para UTXO (BTC, LTC), 18 para EVM (ETH)
    const decimals = (chain === 'ethereum' || chain === 'polygon') ? 18 : 8;
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    // 3. Procesar transacciones
    const rawTxs = addressData.transactions || [];
    const deposits = [];

    for (const tx of rawTxs) {
      // Solo nos interesan los ingresos (balance_change positivo)
      const balanceChange = parseFloat(tx.balance_change || '0');
      if (balanceChange <= 0) continue;

      const blockId = tx.block_id;
      let confirmations = 0;

      // Si block_id es mayor que 0, la transacción está minada
      if (typeof blockId === 'number' && blockId > 0) {
        confirmations = currentBlockHeight - blockId + 1;
      }

      const status = confirmations >= 1 ? 'confirmed' : 'pending';
      const amount = (balanceChange / Math.pow(10, decimals)).toFixed(8);

      deposits.push({
        symbol: upperSymbol,
        amount: amount,
        hash: tx.hash,
        status,
        confirmations,
        timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
      });
    }

    // Ordenar del más reciente al más antiguo
    deposits.sort((a, b) => b.timestamp - a.timestamp);

    console.log(`[Blockchair] Encontrados ${deposits.length} depósitos. Saldo: ${balance}`);

    return NextResponse.json({
      deposits,
      balance,
      currentBlockHeight,
    });

  } catch (error: any) {
    console.error('🔥 [Error en check-deposits]:', error.message);
    return NextResponse.json({ error: error.message || 'Error consultando la red' }, { status: 500 });
  }
}
