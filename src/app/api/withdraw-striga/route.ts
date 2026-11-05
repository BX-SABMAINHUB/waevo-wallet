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

const STRIGA_BASE_URL = 'https://www.sandbox.striga.com/api/v1';
const API_KEY = process.env.STRIGA_API_KEY!;
const API_SECRET = process.env.STRIGA_API_SECRET!;

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
    const { userId, symbol, amountEur, iban, bic, beneficiaryName } = await request.json();
    const upperSymbol = symbol?.toUpperCase();

    if (!userId || !upperSymbol || !amountEur || !iban || !bic || !beneficiaryName) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios (IBAN, BIC y nombre del titular)' }, { status: 400 });
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

    // 2. Crear u obtener el usuario en Striga
    const strigaUserId = await getOrCreateStrigaUser(userId, beneficiaryName);

    // 3. Obtener la cuenta EUR del usuario (sourceAccountId)
    const sourceAccountId = await getEurAccountId(strigaUserId);

    // 4. Iniciar el payout
    const path = '/wallets/send/initiate/bank';
    const body = {
      userId: strigaUserId,
      sourceAccountId: sourceAccountId,
      amount: Math.round(amountEur * 100), // en céntimos
      currency: 'EUR',
      destination: {
        iban: iban.replace(/\s+/g, '').toUpperCase(),
        bic: bic.toUpperCase(),
        name: beneficiaryName,
      },
    };

    console.log(`[Striga] Iniciando payout para usuario ${strigaUserId}`, body);

    const headers = getStrigaHeaders('POST', path, body);
    const strigaRes = await fetch(`${STRIGA_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const strigaData = await strigaRes.json();

    if (!strigaRes.ok) {
      console.error('[Striga Error]', strigaData);
      return NextResponse.json({ 
        error: strigaData.message || JSON.stringify(strigaData) 
      }, { status: strigaRes.status });
    }

    // 5. Descontar saldo en Firebase
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

// Funciones auxiliares (simuladas para el ejemplo)
async function getOrCreateStrigaUser(firebaseUid: string, name: string): Promise<string> {
  // En producción, aquí buscarías en Firestore si ya tienes un strigaUserId guardado.
  // Si no existe, llamarías a POST /user/create de Striga y guardarías el ID.
  // Para este ejemplo, devolvemos el UID de Firebase como si fuera el de Striga.
  // ⚠️ ESTO FALLARÁ HASTA QUE IMPLEMENTES LA CREACIÓN REAL DE USUARIO.
  return firebaseUid; 
}

async function getEurAccountId(strigaUserId: string): Promise<string> {
  // Aquí deberías llamar a GET /wallets para obtener las cuentas del usuario
  // y devolver el ID de la cuenta en EUR.
  // ⚠️ ESTO FALLARÁ HASTA QUE IMPLEMENTES LA OBTENCIÓN REAL DE LA CUENTA.
  return 'account_eur_placeholder';
}

function getCoinGeckoId(symbol: string): string {
  const map: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', LTC: 'litecoin', DOGE: 'dogecoin',
    MATIC: 'matic-network', BNB: 'binancecoin', SOL: 'solana',
  };
  return map[symbol] || symbol.toLowerCase();
}
