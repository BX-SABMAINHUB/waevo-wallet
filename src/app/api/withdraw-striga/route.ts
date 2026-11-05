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

    // 1. Comprobar si el usuario ya está verificado en Striga
    // En un caso real, deberías tener guardado el strigaUserId en Firestore.
    // Para este ejemplo, usamos el userId de Firebase como si fuera el de Striga.
    const strigaUserId = userId; // ⚠️ Esto debe ser el ID real de Striga
    
    // Consultar el estado del KYC en Striga
    const kycStatus = await getKycStatus(strigaUserId);

    if (!kycStatus.approved) {
      // Si no está aprobado, devolvemos un error que el frontend usará para abrir el KYC
      return NextResponse.json({ 
        error: 'KYC_REQUIRED', 
        message: 'Necesitas completar la verificación de identidad antes de retirar.',
        kycUrl: kycStatus.kycUrl // URL del SDK de SumSub
      }, { status: 403 });
    }

    // 2. Si está verificado, obtener la cuenta EUR (sourceAccountId)
    const sourceAccountId = await getEurAccountId(strigaUserId);

    // 3. Verificar saldo en Firebase
    const db = admin.firestore();
    const balanceRef = db.collection('users').doc(userId).collection('balances').doc(symbol.toUpperCase());
    const balanceDoc = await balanceRef.get();
    const currentBalance = balanceDoc.exists ? (balanceDoc.data()?.amount || 0) : 0;

    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${getCoinGeckoId(symbol.toUpperCase())}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[getCoinGeckoId(symbol.toUpperCase())]?.eur;

    if (!priceEur) throw new Error('No se pudo obtener el precio de la moneda.');

    const cryptoAmountToDeduct = amountEur / priceEur;
    if (currentBalance < cryptoAmountToDeduct) {
      return NextResponse.json({ error: 'Saldo insuficiente en tu cuenta.' }, { status: 400 });
    }

    // 4. Ejecutar el retiro con los datos bancarios
    const path = '/wallets/send/initiate/bank';
    const body = {
      userId: strigaUserId,
      sourceAccountId: sourceAccountId,
      amount: Math.round(amountEur * 100),
      currency: 'EUR',
      destination: {
        iban: iban.replace(/\s+/g, '').toUpperCase(),
        bic: bic.toUpperCase(),
        name: beneficiaryName,
      },
    };

    const headers = getStrigaHeaders('POST', path, body);
    const strigaRes = await fetch(`${STRIGA_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const strigaData = await strigaRes.json();

    if (!strigaRes.ok) {
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
async function getKycStatus(userId: string): Promise<{ approved: boolean; kycUrl?: string }> {
  // En producción, llamarías a GET /kyc/{userId} de Striga.
  // Si el estado no es "APPROVED", devolverías la URL del SDK de SumSub.
  // Para este ejemplo, simulamos que NO está aprobado.
  return { approved: false, kycUrl: 'https://sumsub.com/...' };
}

async function getEurAccountId(userId: string): Promise<string> {
  // En producción, llamarías a GET /wallets de Striga para obtener las cuentas.
  // Devolverías el ID de la cuenta en EUR.
  return 'account_eur_placeholder';
}

function getCoinGeckoId(symbol: string): string {
  const map: Record<string, string> = {
    BTC: 'bitcoin', ETH: 'ethereum', LTC: 'litecoin', DOGE: 'dogecoin',
    MATIC: 'matic-network', BNB: 'binancecoin', SOL: 'solana',
  };
  return map[symbol] || symbol.toLowerCase();
}
