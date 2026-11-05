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

// Configuración de Striga
const STRIGA_BASE_URL = 'https://www.sandbox.striga.com/api/v1';
const API_KEY = process.env.STRIGA_API_KEY!;
const API_SECRET = process.env.STRIGA_API_SECRET!;

/**
 * Genera las cabeceras HMAC para autenticación con Striga v1.
 * La ruta (path) NO debe incluir el prefijo '/api/v1'.
 */
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

/**
 * Realiza una petición firmada a la API de Striga y devuelve JSON.
 * Lanza un error legible si la respuesta no es JSON o el código HTTP no es 2xx.
 */
async function strigaRequest(method: string, endpoint: string, body: any = {}) {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const headers = getStrigaHeaders(method, path, body);
  const url = `${STRIGA_BASE_URL}${path}`;

  const res = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    // Si Striga devuelve HTML o texto plano, lo convertimos en un error controlado
    throw new Error(`Striga respondió con un error ${res.status}: ${text || 'Sin cuerpo'}`);
  }

  if (!res.ok) {
    // Algunos errores de Striga vienen en data.message o data.error
    const message = data?.message || data?.error || JSON.stringify(data);
    throw new Error(`Error de Striga (${res.status}): ${message}`);
  }

  return data;
}

export async function POST(request: Request) {
  try {
    const { userId, symbol, amountEur, iban, bic, beneficiaryName } = await request.json();

    // 1. Verificar el estado del KYC en Striga
    // En producción, el userId de Striga debe estar guardado en Firestore.
    // Aquí asumimos que el userId de Firebase coincide con el de Striga.
    const strigaUserId = userId;
    const kycData = await strigaRequest('GET', `/user/kyc/${strigaUserId}`);

    // Striga devuelve el estado en kycData.status (p. ej. "APPROVED", "REJECTED_FINAL")
    const isApproved = kycData?.status === 'APPROVED';
    if (!isApproved) {
      return NextResponse.json(
        {
          error: 'KYC_REQUIRED',
          message: 'Necesitas completar la verificación de identidad antes de retirar.',
        },
        { status: 403 }
      );
    }

    // 2. Obtener la cuenta EUR (sourceAccountId) del usuario
    // Según la documentación, se obtienen todas las wallets del negocio
    // y se busca la cuenta en EUR.
    const walletsData = await strigaRequest('POST', '/wallets/business/get/all', { page: 1 });
    let sourceAccountId: string | null = null;

    // La respuesta contiene un array de wallets con sus accounts
    for (const wallet of walletsData.wallets || []) {
      for (const [currency, account] of Object.entries(wallet.accounts || {})) {
        if (currency === 'EUR' && (account as any).accountId) {
          sourceAccountId = (account as any).accountId;
          break;
        }
      }
      if (sourceAccountId) break;
    }

    if (!sourceAccountId) {
      throw new Error('No se encontró una cuenta EUR para el usuario.');
    }

    // 3. Verificar el saldo en Firebase (crypto balance) y calcular la cantidad a descontar
    const db = admin.firestore();
    const balanceRef = db.collection('users').doc(userId).collection('balances').doc(symbol.toUpperCase());
    const balanceDoc = await balanceRef.get();
    const currentBalance = balanceDoc.exists ? (balanceDoc.data()?.amount || 0) : 0;

    // Obtener precio actual en EUR desde CoinGecko
    const coinGeckoId = getCoinGeckoId(symbol.toUpperCase());
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinGeckoId}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[coinGeckoId]?.eur;

    if (!priceEur) throw new Error('No se pudo obtener el precio de la moneda.');

    const cryptoAmountToDeduct = amountEur / priceEur;
    if (currentBalance < cryptoAmountToDeduct) {
      return NextResponse.json({ error: 'Saldo insuficiente en tu cuenta.' }, { status: 400 });
    }

    // 4. Ejecutar el retiro bancario en Striga
    const withdrawalBody = {
      userId: strigaUserId,
      sourceAccountId: sourceAccountId,
      amount: Math.round(amountEur * 100), // Striga espera céntimos
      currency: 'EUR',
      destination: {
        iban: iban.replace(/\s+/g, '').toUpperCase(),
        bic: bic.toUpperCase(),
        name: beneficiaryName,
      },
    };

    const strigaResult = await strigaRequest('POST', '/wallets/send/initiate/bank', withdrawalBody);

    // 5. Descontar el saldo en Firebase dentro de una transacción
    await db.runTransaction(async (t) => {
      const doc = await t.get(balanceRef);
      const balance = doc.exists ? doc.data()?.amount || 0 : 0;
      t.update(balanceRef, { amount: balance - cryptoAmountToDeduct });
    });

    return NextResponse.json({
      success: true,
      message: `Striga ha aceptado la orden. ID: ${strigaResult.id || 'OK'}`,
    });

  } catch (error: any) {
    console.error('🔥 [Error en withdraw-striga]:', error);
    // Nos aseguramos de devolver siempre JSON, incluso ante errores inesperados
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' },
      { status: 500 }
    );
  }
}

/**
 * Mapea símbolos de criptomonedas a IDs de CoinGecko.
 */
function getCoinGeckoId(symbol: string): string {
  const map: Record<string, string> = {
    BTC: 'bitcoin',
    ETH: 'ethereum',
    LTC: 'litecoin',
    DOGE: 'dogecoin',
    MATIC: 'matic-network',
    BNB: 'binancecoin',
    SOL: 'solana',
  };
  return map[symbol] || symbol.toLowerCase();
}
