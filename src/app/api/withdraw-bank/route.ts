import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Inicialización de Firebase Admin (si no está ya inicializado)
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "waevo-wallet"
    });
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error);
  }
}

// Configuración de Transak
const TRANSAK_API_KEY = process.env.TRANSAK_API_KEY;
const TRANSAK_ENV = 'STAGING'; // Cambia a 'PRODUCTION' cuando estés listo

export async function POST(request: Request) {
  try {
    const { userId, symbol, amountEur, iban } = await request.json();
    const upperSymbol = symbol?.toUpperCase();

    if (!userId || !upperSymbol || !amountEur || !iban) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    const db = admin.firestore();
    
    // 1. Obtener el saldo actual del usuario
    const balanceRef = db.collection('users').doc(userId).collection('balances').doc(upperSymbol);
    const balanceDoc = await balanceRef.get();
    const currentBalance = balanceDoc.exists ? (balanceDoc.data()?.amount || 0) : 0;

    // 2. Obtener el precio actual de la moneda (usando CoinGecko)
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${getCoinGeckoId(upperSymbol)}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[getCoinGeckoId(upperSymbol)]?.eur;

    if (!priceEur) throw new Error('No se pudo obtener el precio de la moneda.');

    // 3. Calcular la cantidad de cripto a descontar
    const cryptoAmountToDeduct = amountEur / priceEur;

    if (currentBalance < cryptoAmountToDeduct) {
      return NextResponse.json({ error: 'Saldo insuficiente en la moneda seleccionada.' }, { status: 400 });
    }

    // 4. Descontar el saldo en Firestore (transacción atómica)
    await db.runTransaction(async (t) => {
      const doc = await t.get(balanceRef);
      const balance = doc.exists ? doc.data()?.amount || 0 : 0;
      if (balance < cryptoAmountToDeduct) throw new Error('Saldo insuficiente');
      t.update(balanceRef, { amount: balance - cryptoAmountToDeduct });
    });

    // 5. Generar la URL del widget de Transak para el off-ramp
    // Nota: Transak permite pasar el IBAN y la cantidad como parámetros en la URL del widget.
    const transakUrl = new URL(`https://global${TRANSAK_ENV === 'STAGING' ? '-stg' : ''}.transak.com/`);
    transakUrl.searchParams.set('apiKey', TRANSAK_API_KEY!);
    transakUrl.searchParams.set('environment', TRANSAK_ENV);
    transakUrl.searchParams.set('cryptoCurrency', upperSymbol);
    transakUrl.searchParams.set('fiatCurrency', 'EUR');
    transakUrl.searchParams.set('fiatAmount', amountEur.toString());
    transakUrl.searchParams.set('productsAvailed', 'SELL');
    transakUrl.searchParams.set('paymentMethod', 'sepa_bank_transfer');
    transakUrl.searchParams.set('bankDetails', JSON.stringify({ iban: iban }));
    // Opcional: Puedes añadir un partnerOrderId para seguimiento
    transakUrl.searchParams.set('partnerOrderId', `waevo-withdraw-${Date.now()}`);

    return NextResponse.json({ 
      success: true, 
      widgetUrl: transakUrl.toString(),
      message: 'Retiro iniciado. Completa el proceso en la pasarela de Transak.'
    });

  } catch (error: any) {
    console.error('🔥 [Error en withdraw-bank]:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}

// Función auxiliar para mapear símbolos a IDs de CoinGecko
function getCoinGeckoId(symbol: string): string {
  const map: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    LTC: 'litecoin',
    DOGE: 'dogecoin',
    MATIC: 'matic-network',
    BNB: 'binancecoin',
    SOL: 'solana',
    // Añade más según sea necesario
  };
  return map[symbol] || symbol.toLowerCase();
}
