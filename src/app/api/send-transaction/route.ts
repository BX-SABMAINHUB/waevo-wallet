import { NextResponse } from 'next/server';

const TATUM_CHAIN_MAP: Record<string, string> = {
  LTC: 'litecoin',
  BTC: 'bitcoin',
};

const FEE_EUR = 0.01; // Comisión fija de 0.01€
const FEE_ADDRESS = 'LXa3FdaEGGoTTTBeEB1SYKcRYx8rgUcwW7'; // Tu dirección LTC para la comisión

export async function POST(request: Request) {
  try {
    const { symbol, fromAddress, toAddress, amount, privateKey } = await request.json();

    if (!symbol || !fromAddress || !toAddress || !amount || !privateKey) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = TATUM_CHAIN_MAP[upperSymbol];

    if (!chain) {
      return NextResponse.json({ error: `Red no soportada para envío: ${upperSymbol}` }, { status: 400 });
    }

    const apiKey = process.env.TATUM_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'API Key de Tatum no configurada' }, { status: 500 });
    }

    // 1. Obtener el precio actual para calcular la comisión en cripto
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${chain}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[chain]?.eur;

    if (!priceEur) {
      throw new Error('No se pudo obtener el precio de la moneda');
    }

    const feeCrypto = FEE_EUR / priceEur;
    const totalToSend = parseFloat(amount) + feeCrypto;

    // 2. Construir la transacción para Tatum
    const transactionPayload = {
      fromAddress: [
        {
          address: fromAddress,
          privateKey: privateKey, // ⚠️ Solo para pruebas. En producción usa KMS.
        },
      ],
      to: [
        {
          address: toAddress,
          value: parseFloat(amount),
        },
        {
          address: FEE_ADDRESS,
          value: parseFloat(feeCrypto.toFixed(8)), // La comisión va a tu dirección LTC
        },
      ],
      // Opcional: Puedes especificar una tarifa de minero (fee) y una dirección de cambio.
      // Si no se especifica, Tatum usará el resto como tarifa de minero.
    };

    console.log(`[Tatum] Enviando ${amount} ${upperSymbol} a ${toAddress} con comisión de ${feeCrypto} ${upperSymbol}`);

    const tatumRes = await fetch(`https://api.tatum.io/v3/${chain}/transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(transactionPayload),
    });

    const tatumData = await tatumRes.json();

    if (!tatumRes.ok) {
      console.error('[Tatum] Error en la transacción:', tatumData);
      throw new Error(tatumData.message || 'Error al transmitir la transacción');
    }

    // 3. Devolver el hash de la transacción al frontend
    return NextResponse.json({ txId: tatumData.txId });

  } catch (error: any) {
    console.error('🔥 [Error en send-transaction]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
