import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

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

// ⚠️ Asegúrate de tener esto en tus variables de entorno
const STRIGA_BASE_URL = 'https://www.sandbox.striga.com/api/v1'; // O producción si ya tienes acceso
const API_KEY = process.env.STRIGA_API_KEY!;
const API_SECRET = process.env.STRIGA_API_SECRET!;

// Función HMAC que Striga exige
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
    
    // 1. Verificar saldo en Firebase
    const balanceRef = db.collection('users').doc(userId).collection('balances').doc(upperSymbol);
    const balanceDoc = await balanceRef.get();
    const currentBalance = balanceDoc.exists ? (balanceDoc.data()?.amount || 0) : 0;

    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${getCoinGeckoId(upperSymbol)}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[getCoinGeckoId(upperSymbol)]?.eur;

    if (!priceEur) throw new Error('No se pudo obtener el precio de la moneda.');

    const cryptoAmountToDeduct = amountEur / priceEur;
    if (currentBalance < cryptoAmountToDeduct) {
      return NextResponse.json({ error: 'Saldo insuficiente en tu cuenta.' }, { status: 400 });
    }

    // 2. Llamada REAL a Striga
    const path = '/wallets/send/initiate/bank';
    
    // ⚠️ NOTA: Striga requiere un "walletId" real de una cuenta creada previamente.
    // Como aún no hemos creado la cuenta del usuario en Striga, usaremos un ID de prueba
    // o el que tengas configurado. Si no existe, Striga devolverá un error real.
    const body = {
      walletId: `wallet_${userId}_eur`, 
      amount: Math.round(amountEur * 100), // Striga usa céntimos
      currency: 'EUR',
      destinationIban: iban.replace(/\s+/g, '').toUpperCase(),
      reference: `Waevo Retiro ${Date.now()}`,
    };

    console.log(`[Striga] Enviando petición a ${path}`, body);

    const headers = getStrigaHeaders('POST', path, body);

    const strigaRes = await fetch(`${STRIGA_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const strigaData = await strigaRes.json();

    // Si Striga devuelve error, lo mostramos tal cual
    if (!strigaRes.ok) {
      console.error('[Striga Error]', strigaData);
      return NextResponse.json({ 
        error: strigaData.message || JSON.stringify(strigaData) 
      }, { status: strigaRes.status });
    }

    // 3. Si Striga acepta, descontamos el saldo en Firebase
    await db.runTransaction(async (t) => {
      const doc = await t.get(balanceRef);
      const balance = doc.exists ? doc.data()?.amount || 0 : 0;
      t.update(balanceRef, { amount: balance - cryptoAmountToDeduct });
    });

    return NextResponse.json({
      success: true,
      message: `Striga ha aceptado la orden. ID: ${strigaData.id || 'OK'}`,
    });

  } catch (error: any) {
    console.error('🔥 [Error en withdraw-striga]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}

function getCoinGeckoId(symbol: string): string {
  const map: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', LTC: 'litecoin', DOGE: 'dogecoin',
    MATIC: 'matic-network', BNB: 'binancecoin', SOL: 'solana',
  };
  return map[symbol] || symbol.toLowerCase();
}
