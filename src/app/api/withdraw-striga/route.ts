import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

// Inicialización de Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error);
  }
}

const STRIGA_BASE_URL = 'https://www.sandbox.striga.com/api/v1'; // Entorno de pruebas
const API_KEY = process.env.STRIGA_API_KEY!;
const API_SECRET = process.env.STRIGA_API_SECRET!;

// Función para generar las cabeceras HMAC que exige Striga
function getStrigaHeaders(method: string, path: string, body: any) {
  const time = Date.now().toString();
  const bodyString = JSON.stringify(body);
  const contentHash = crypto.createHash('md5').update(bodyString).digest('hex');
  
  const signatureRaw = time + method + path + contentHash;
  const signature = crypto.createHmac('sha256', API_SECRET).update(signatureRaw).digest('hex');
  
  return {
    'api-key': API_KEY,
    'Authorization': `HMAC ${time}:${signature}`,
    'Content-Type': 'application/json',
  };
}

export async function POST(request: Request) {
  try {
    const { userId, symbol, amountEur, iban } = await request.json();
    const upperSymbol = symbol?.toUpperCase();

    if (!userId || !upperSymbol || !amountEur || !iban) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    const db = admin.firestore();
    
    // 1. Obtener saldo y validar
    const balanceRef = db.collection('users').doc(userId).collection('balances').doc(upperSymbol);
    const balanceDoc = await balanceRef.get();
    const currentBalance = balanceDoc.exists ? (balanceDoc.data()?.amount || 0) : 0;

    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${getCoinGeckoId(upperSymbol)}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[getCoinGeckoId(upperSymbol)]?.eur;
    if (!priceEur) throw new Error('No se pudo obtener el precio de la moneda.');

    const cryptoAmountToDeduct = amountEur / priceEur;
    if (currentBalance < cryptoAmountToDeduct) {
      return NextResponse.json({ error: 'Saldo insuficiente.' }, { status: 400 });
    }

    // 2. Llamar a Striga para iniciar el retiro SEPA
    const path = '/wallets/send/initiate/bank';
    const body = {
      walletId: `wallet_${userId}_eur`, // ID del wallet EUR del usuario en Striga
      amount: Math.round(amountEur * 100), // Striga usa la unidad mínima (céntimos)
      currency: 'EUR',
      destinationIban: iban.replace(/\s+/g, '').toUpperCase(),
      reference: `Waevo Retiro ${Date.now()}`,
    };

    const headers = getStrigaHeaders('POST', path, body);

    const strigaRes = await fetch(`${STRIGA_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const strigaData = await strigaRes.json();
    if (!strigaRes.ok) {
      throw new Error(strigaData.message || 'Error al iniciar el retiro en Striga');
    }

    // 3. Descontar saldo en Firestore (solo si Striga aceptó la orden)
    await db.runTransaction(async (t) => {
      const doc = await t.get(balanceRef);
      const balance = doc.exists ? doc.data()?.amount || 0 : 0;
      if (balance < cryptoAmountToDeduct) throw new Error('Saldo insuficiente');
      t.update(balanceRef, { amount: balance - cryptoAmountToDeduct });
    });

    return NextResponse.json({
      success: true,
      message: `Retiro de ${amountEur.toFixed(2)} € iniciado. Recibirás el dinero en tu banco en 1-2 días hábiles.`,
    });

  } catch (error: any) {
    console.error('🔥 [Error en withdraw-striga]:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}

function getCoinGeckoId(symbol: string): string {
  const map: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', LTC: 'litecoin', DOGE: 'dogecoin',
    MATIC: 'matic-network', BNB: 'binancecoin', SOL: 'solana',
  };
  return map[symbol] || symbol.toLowerCase();
}
