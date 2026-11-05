import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Inicialización de Firebase Admin (igual que en tus otras APIs)
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

const WIREX_API_URL = 'https://api.wirexapp.com'; // Ajusta según la documentación

// Función para obtener el token de acceso de Wirex
async function getWirexToken() {
  const res = await fetch(`${WIREX_API_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.WIREX_CLIENT_ID!,
      client_secret: process.env.WIREX_CLIENT_SECRET!,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Error de autenticación con Wirex');
  return data.access_token;
}

export async function POST(request: Request) {
  try {
    const { userId, symbol, amountEur, iban } = await request.json();
    const db = admin.firestore();

    // 1. Obtener el saldo del usuario desde Firebase
    const balanceRef = db.collection('users').doc(userId).collection('balances').doc(symbol.toUpperCase());
    const balanceDoc = await balanceRef.get();
    const currentBalance = balanceDoc.exists ? (balanceDoc.data()?.amount || 0) : 0;

    // 2. Verificar saldo (asumiendo que ya tienes el precio de CoinGecko)
    // ... (lógica de conversión de EUR a cripto) ...
    // if (currentBalance < cryptoAmountToDeduct) return error...

    // 3. Autenticarse en Wirex
    const token = await getWirexToken();
    const authHeaders = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

    // 4. Obtener la cuenta bancaria (IBAN virtual) del usuario en Wirex
    const accountsRes = await fetch(`${WIREX_API_URL}/api/v1/bank/accounts`, { headers: authHeaders });
    const accountsData = await accountsRes.json();
    const userIban = accountsData.accounts?.[0]?.iban; // Ajusta según la respuesta real

    if (!userIban) throw new Error('El usuario no tiene una cuenta IBAN activa en Wirex.');

    // 5. Crear la transferencia SEPA saliente desde el IBAN de Wirex al IBAN del usuario
    const transferRes = await fetch(`${WIREX_API_URL}/api/v1/bank/transfer`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        source_iban: userIban,
        destination_iban: iban,
        amount: amountEur,
        currency: 'EUR',
        reference: `Waevo Retiro ${Date.now()}`,
      }),
    });

    const transferData = await transferRes.json();
    if (!transferRes.ok) throw new Error(transferData.message || 'Error en la transferencia de Wirex');

    // 6. Descontar el saldo en Firebase (transacción atómica)
    await db.runTransaction(async (t) => {
      const doc = await t.get(balanceRef);
      const balance = doc.exists ? doc.data()?.amount || 0 : 0;
      // t.update(balanceRef, { amount: balance - cryptoAmountToDeduct });
    });

    return NextResponse.json({
      success: true,
      message: 'Retiro SEPA iniciado correctamente. El dinero llegará a tu banco en 1-2 días hábiles.',
    });

  } catch (error: any) {
    console.error('🔥 [Error en withdraw-wirex]:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
