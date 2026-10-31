import { NextResponse } from 'next/server';

// Mapeo de símbolos a los identificadores de cadena de Blockchair
const BLOCKCHAIR_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
  MATIC: 'polygon',
  // Puedes añadir más cadenas UTXO o EVM aquí
};

// Límite de transacciones a procesar para no exceder el límite de la API
const MAX_TRANSACTIONS_TO_PROCESS = 10;

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = BLOCKCHAIR_CHAIN_MAP[upperSymbol];

    if (!chain) {
      return NextResponse.json(
        { error: `Red no soportada para ${upperSymbol}` },
        { status: 400 }
      );
    }

    // 1. Construir la URL correcta del dashboard de la dirección
    // El parámetro 'transaction_details=true' no es estándar. Usamos 'limit' para paginar.
    const url = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${address}`);
    url.searchParams.append('limit', MAX_TRANSACTIONS_TO_PROCESS.toString());

    // 2. Hacer la petición a Blockchair
    const res = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        // Opcional: Si tienes una API key de Blockchair, añádela aquí como variable de entorno
        // 'Authorization': `Bearer ${process.env.BLOCKCHAIR_API_KEY}`,
      },
    });

    // 3. Manejo de errores de la API (límite de tasa, etc.)
    if (!res.ok) {
      const errorText = await res.text();
      console.error(`[Blockchair] Error ${res.status}: ${errorText}`);
      
      if (res.status === 402) { // Límite de peticiones excedido
        return NextResponse.json(
          { error: 'Límite de peticiones a Blockchair excedido. Inténtalo más tarde.' },
          { status: 429 }
        );
      }
      throw new Error(`Error en Blockchair: ${res.status}`);
    }

    const data = await res.json();
    const addressData = data.data?.[address];

    if (!addressData) {
      return NextResponse.json({
        deposits: [],
        balance: '0',
        message: 'Dirección no encontrada en Blockchair',
      });
    }

    // 4. Obtener el saldo real (en la unidad más pequeña)
    const balanceRaw = addressData.address?.balance || '0';
    // Blockchair devuelve el saldo en la unidad mínima (satoshis, wei, etc.)
    // Para UTXO: 8 decimales. Para EVM: 18 decimales.
    const decimals = (chain === 'ethereum' || chain === 'polygon') ? 18 : 8;
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    // 5. Obtener la altura actual de la blockchain para calcular confirmaciones
    const currentBlockHeight = data.context?.state;
    if (typeof currentBlockHeight !== 'number') {
      throw new Error('No se pudo obtener la altura actual de la blockchain');
    }

    // 6. Procesar las transacciones
    const transactions = addressData.transactions || [];
    const deposits = transactions.map((tx: any) => {
      // 'block_id' es la altura del bloque donde se incluyó la transacción
      const blockId = tx.block_id;
      let confirmations = 0;

      // Si block_id > 0, la transacción está minada. Calculamos las confirmaciones.
      if (typeof blockId === 'number' && blockId > 0) {
        confirmations = currentBlockHeight - blockId + 1; // Fórmula oficial
      }
      // Si block_id es 0 o negativo, la transacción está pendiente (en mempool)
      
      // Consideramos confirmado si tiene al menos 1 confirmación
      const status = confirmations >= 1 ? 'confirmed' : 'pending';

      // El valor neto del cambio de balance para esta dirección
      const valueRaw = tx.balance_change || 0;
      const amount = (parseFloat(valueRaw) / Math.pow(10, decimals)).toFixed(8);

      return {
        symbol: upperSymbol,
        amount: Math.abs(parseFloat(amount)).toString(), // Valor absoluto para depósitos
        hash: tx.hash,
        status,
        confirmations,
        timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
      };
    });

    // 7. Devolver la respuesta exitosa
    return NextResponse.json({
      deposits,
      balance, // Saldo total actual de la dirección
      currentBlockHeight,
    });

  } catch (error: any) {
    console.error('🔥 [Error Crítico] en check-deposits (Blockchair):', error);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' },
      { status: 500 }
    );
  }
}
