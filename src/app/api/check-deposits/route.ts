import { NextResponse } from 'next/server';

// Mapeo de símbolos a los paths de la API legacy de Blockchain.com
const BLOCKCHAIN_INFO_PATHS: Record<string, string> = {
  BTC: 'btc',
  LTC: 'ltc',
  BCH: 'bch',
  // Otros como ETH, SOL, etc., usan la API moderna, no este endpoint legacy.
};

export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const path = BLOCKCHAIN_INFO_PATHS[upperSymbol];

    if (!path) {
      return NextResponse.json(
        { error: `Blockchain.com (legacy) no soporta ${upperSymbol}` },
        { status: 400 }
      );
    }

    // 1. Obtener la altura actual del último bloque de la red
    const blockRes = await fetch(`https://blockchain.info/${path}/latestblock?format=json`);
    if (!blockRes.ok) throw new Error('No se pudo obtener la altura del bloque');
    const blockData = await blockRes.json();
    const currentBlockHeight = blockData.height;
    if (typeof currentBlockHeight !== 'number') throw new Error('Altura de bloque inválida');

    // 2. Obtener los datos de la dirección (incluye transacciones)
    const addrRes = await fetch(`https://blockchain.info/${path}/address/${address}?format=json`);
    if (!addrRes.ok) {
      if (addrRes.status === 404) {
        // Dirección sin actividad
        return NextResponse.json({ deposits: [], balance: '0' });
      }
      const errText = await addrRes.text();
      throw new Error(`Blockchain.com error: ${addrRes.status} - ${errText}`);
    }
    const addrData = await addrRes.json();

    // 3. Calcular el saldo (en la unidad mínima, dividir por 1e8)
    const balanceRaw = addrData.final_balance || 0;
    const balance = (balanceRaw / 1e8).toFixed(8);

    // 4. Procesar transacciones (solo entrantes)
    const transactions = addrData.txs || [];
    const deposits = transactions
      .filter((tx: any) => {
        // Comprobar si la dirección está en los outputs (entrante)
        const isIncoming = tx.out?.some((out: any) => out.addr === address);
        // Ignorar coinbase (minería) para evitar falsos positivos
        const isCoinbase = tx.inputs?.some((inp: any) => inp.prev_out?.addr === undefined);
        return isIncoming && !isCoinbase;
      })
      .map((tx: any) => {
        const blockHeight = tx.block_height;
        let confirmations = 0;
        if (typeof blockHeight === 'number' && blockHeight > 0) {
          confirmations = currentBlockHeight - blockHeight + 1;
        }
        const status = confirmations >= 1 ? 'confirmed' : 'pending';

        // Calcular el valor total recibido en esta dirección en esta transacción
        let receivedValue = 0;
        tx.out?.forEach((out: any) => {
          if (out.addr === address) {
            receivedValue += (out.value || 0);
          }
        });
        const amount = (receivedValue / 1e8).toFixed(8);

        return {
          symbol: upperSymbol,
          amount,
          hash: tx.hash,
          status,
          confirmations,
          timestamp: tx.time ? tx.time * 1000 : Date.now(),
        };
      })
      .sort((a: any, b: any) => b.timestamp - a.timestamp); // Más reciente primero

    return NextResponse.json({
      deposits,
      balance,
      currentBlockHeight,
    });

  } catch (error: any) {
    console.error('🔥 [Error Crítico] en check-deposits (Blockchain.com):', error.message);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos con Blockchain.com' },
      { status: 500 }
    );
  }
}
