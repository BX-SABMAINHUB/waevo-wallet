import { NextResponse } from 'next/server';

// Mapeo de símbolos a los slugs de Blockchair
const BLOCKCHAIR_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
  MATIC: 'polygon',
  // Añade más cadenas UTXO o EVM según necesites
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
      return NextResponse.json({ error: `Red no soportada para ${upperSymbol}` }, { status: 400 });
    }

    // Consultamos el dashboard de la dirección con los detalles de las transacciones
    const url = `https://api.blockchair.com/${chain}/dashboards/address/${address}?transaction_details=true&limit=20`;
    
    const res = await fetch(url, {
      // Blockchair permite 1440 peticiones/día sin clave, suficiente para pruebas
      headers: { 'Accept': 'application/json' },
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Blockchair error: ${res.status} - ${errorText}`);
    }

    const data = await res.json();
    const addressData = data.data[address];

    if (!addressData) {
      return NextResponse.json({ deposits: [], balance: '0', message: 'Dirección no encontrada' });
    }

    // 1. Obtener el saldo real de la dirección (en la unidad más pequeña)
    const balanceRaw = addressData.address.balance;
    const decimals = chain === 'ethereum' || chain === 'polygon' ? 18 : 8;
    const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

    // 2. Obtener la altura actual de la blockchain para calcular confirmaciones
    const currentBlockHeight = data.context.state;

    // 3. Procesar transacciones
    const transactions = addressData.transactions || [];
    const deposits = transactions.map((tx: any) => {
      // Si la transacción no está en un bloque (block_id = -1 o 0), está pendiente
      const blockId = tx.block_id;
      let confirmations = 0;
      
      if (blockId > 0) {
        // Fórmula oficial de Blockchair para UTXO: confirmations = state - block_id + 1
        confirmations = currentBlockHeight - blockId + 1;
      }

      // Consideramos confirmado si tiene al menos 1 confirmación (o 3 para seguridad)
      const requiredConfirmations = 3; 
      const status = confirmations >= requiredConfirmations ? 'confirmed' : 'pending';

      // Calcular el valor recibido (balance_change suele ser el valor neto para esa dirección)
      const value = tx.balance_change || 0;
      const amount = (parseFloat(value) / Math.pow(10, decimals)).toFixed(8);

      return {
        symbol: upperSymbol,
        amount: Math.abs(parseFloat(amount)).toString(), // Valor absoluto para depósitos
        hash: tx.hash,
        status,
        confirmations,
        timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
      };
    });

    // 4. Devolver todo: depósitos, saldo y altura del bloque
    return NextResponse.json({ 
      deposits, 
      balance, 
      currentBlockHeight 
    });

  } catch (error: any) {
    console.error('Error en check-deposits (Blockchair):', error);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' }, 
      { status: 500 }
    );
  }
}
