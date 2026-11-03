import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

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

export async function POST(request: Request) {
  try {
    const { userId, fromSymbol, toSymbol, fromAmount, fromPrice, toPrice } = await request.json();

    if (!userId || !fromSymbol || !toSymbol || !fromAmount || !fromPrice || !toPrice) {
      return NextResponse.json({ error: 'Faltan parámetros para el intercambio' }, { status: 400 });
    }

    const db = admin.firestore();
    const fromRef = db.collection('users').doc(userId).collection('balances').doc(fromSymbol);
    const toRef = db.collection('users').doc(userId).collection('balances').doc(toSymbol);

    // Calcular cuánto se va a recibir
    const amountEur = fromAmount * fromPrice;
    const toAmount = amountEur / toPrice;

    // 🔥 TRANSACCIÓN ATÓMICA: O se hace todo o no se hace nada
    await db.runTransaction(async (t) => {
      const fromDoc = await t.get(fromRef);
      const currentFromBalance = fromDoc.exists ? (fromDoc.data()?.amount || 0) : 0;

      // Validar que el usuario realmente tiene ese saldo
      if (currentFromBalance < fromAmount) {
        throw new Error('Saldo insuficiente en la moneda de origen.');
      }

      const toDoc = await t.get(toRef);
      const currentToBalance = toDoc.exists ? (toDoc.data()?.amount || 0) : 0;

      // Restar de la moneda origen y sumar a la moneda destino
      t.set(fromRef, { amount: currentFromBalance - fromAmount }, { merge: true });
      t.set(toRef, { amount: currentToBalance + toAmount }, { merge: true });
    });

    return NextResponse.json({ 
      success: true, 
      message: `Intercambio completado: ${fromAmount} ${fromSymbol} a ${toAmount.toFixed(6)} ${toSymbol}` 
    });

  } catch (error: any) {
    console.error('🔥 [Error en exchange]:', error.message);
    return NextResponse.json({ error: error.message || 'Error interno del intercambio' }, { status: 500 });
  }
}
