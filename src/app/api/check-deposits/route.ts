import { NextResponse } from 'next/server';

// Mapeo de símbolos a los nombres de cadena que usa Tatum en sus endpoints v3
const TATUM_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
  ETH: 'ethereum',
  MATIC: 'polygon',
};

// Cadenas UTXO que usan el mismo formato de respuesta en v3
const UTXO_CHAINS = ['bitcoin', 'litecoin', 'dogecoin', 'bitcoin-cash'];

export async function POST(request: Request) {
  const startTime = Date.now();
  console.log(`\n[CHECK-DEPOSITS] Iniciando verificación con Tatum v3...`);

  try {
    const body = await request.json();
    const { symbol, address } = body;

    if (!symbol || !address) {
      console.error(`❌ Faltan parámetros: symbol=${symbol}, address=${address}`);
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = TATUM_CHAIN_MAP[upperSymbol];

    if (!chain) {
      console.error(`❌ Red no soportada: ${upperSymbol}`);
      return NextResponse.json({ error: `Red ${upperSymbol} no soportada` }, { status: 400 });
    }

    // Solo procesamos cadenas UTXO con esta lógica
    if (!UTXO_CHAINS.includes(chain)) {
      console.log(`⚠️ Saltando ${chain} (no es UTXO)`);
      return NextResponse.json({ deposits: [], balance: '0' });
    }

    const apiKey = process.env.TATUM_API_KEY;
    if (!apiKey) {
      console.error('❌ TATUM_API_KEY no está configurada');
      return NextResponse.json({ error: 'API Key de Tatum no configurada' }, { status: 500 });
    }

    // 1. Obtener la altura actual de la blockchain
    console.log(`📡 Obteniendo altura actual de ${chain}...`);
    const infoRes = await fetch(`https://api.tatum.io/v3/${chain}/info`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!infoRes.ok) {
      const errText = await infoRes.text();
      console.error(`❌ Error obteniendo info de ${chain}: ${infoRes.status} - ${errText}`);
      throw new Error(`Error Tatum (info): ${infoRes.status}`);
    }

    const infoData = await infoRes.json();
    // El campo 'blocks' contiene la altura del último bloque
    const currentBlock = infoData.blocks;
    if (typeof currentBlock !== 'number') {
      console.error(`❌ Altura de bloque inválida: ${currentBlock}`);
      throw new Error('No se pudo obtener la altura del bloque actual');
    }

    console.log(`📦 Altura actual de ${chain}: ${currentBlock}`);

    // 2. Obtener las transacciones de la dirección
    console.log(`📡 Obteniendo transacciones de ${address}...`);
    const txRes = await fetch(`https://api.tatum.io/v3/${chain}/transaction/address/${address}`, {
      headers: { 'x-api-key': apiKey },
    });

    // Si la dirección no tiene transacciones, Tatum devuelve 404
    if (txRes.status === 404) {
      console.log(`ℹ️ La dirección ${address} no tiene transacciones en ${chain}`);
      return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
    }

    if (!txRes.ok) {
      const errText = await txRes.text();
      console.error(`❌ Error obteniendo transacciones: ${txRes.status} - ${errText}`);
      throw new Error(`Error Tatum (txs): ${txRes.status}`);
    }

    const transactions = await txRes.json();

    if (!Array.isArray(transactions) || transactions.length === 0) {
      console.log(`ℹ️ No se encontraron transacciones para ${address}`);
      return NextResponse.json({ deposits: [], balance: '0', currentBlockHeight: currentBlock });
    }

    console.log(`📋 Transacciones encontradas: ${transactions.length}`);

    // 3. Procesar las transacciones
    const deposits = [];
    let totalConfirmedBalance = 0;

    for (const tx of transactions) {
      // Verificar si la dirección está en los outputs (es un ingreso)
      const isIncoming = tx.outputs?.some((out: any) => out.address === address);
      
      if (!isIncoming) {
        continue; // Ignorar transacciones salientes
      }

      // Calcular el valor total recibido en esta dirección
      let receivedValue = 0;
      tx.outputs?.forEach((out: any) => {
        if (out.address === address) {
          receivedValue += parseFloat(out.value || 0);
        }
      });

      // Si no se recibió nada, saltar
      if (receivedValue <= 0) continue;

      // Calcular confirmaciones
      const txBlock = tx.blockNumber || 0;
      let confirmations = 0;
      if (txBlock > 0) {
        confirmations = currentBlock - txBlock + 1;
      }

      // Consideramos confirmado a partir de 1 confirmación
      const status = confirmations >= 1 ? 'confirmed' : 'pending';

      // Formatear cantidad (dividir por 10^8 para UTXO)
      const decimals = 8;
      const amount = (receivedValue / Math.pow(10, decimals)).toFixed(8);

      // Sumar al saldo total solo si está confirmada
      if (status === 'confirmed') {
        totalConfirmedBalance += receivedValue / Math.pow(10, decimals);
      }

      console.log(`  → ${amount} ${upperSymbol} | Confirmaciones: ${confirmations} | ${status} | Hash: ${tx.hash?.substring(0, 10)}...`);

      deposits.push({
        symbol: upperSymbol,
        amount,
        hash: tx.hash,
        status,
        confirmations,
        timestamp: tx.time ? tx.time * 1000 : Date.now(),
      });
    }

    // Ordenar por fecha descendente (más reciente primero)
    deposits.sort((a, b) => b.timestamp - a.timestamp);

    const duration = Date.now() - startTime;
    console.log(`✅ Verificación completada en ${duration}ms. Depósitos: ${deposits.length} | Saldo confirmado: ${totalConfirmedBalance.toFixed(8)} ${upperSymbol}`);
    console.log(`========================================\n`);

    return NextResponse.json({
      deposits,
      balance: totalConfirmedBalance.toFixed(8),
      currentBlockHeight: currentBlock,
    });

  } catch (error: any) {
    console.error('🔥 [ERROR CRÍTICO] en check-deposits:', error.message);
    console.log(`========================================\n`);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' },
      { status: 500 }
    );
  }
}
