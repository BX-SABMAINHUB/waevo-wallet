import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// ... inicialización de Firebase Admin ...

export async function POST(req: Request) {
  const body = await req.json();
  // ⚠️ IMPORTANTE: Verifica la firma del webhook de Lithic para seguridad.
  // Esto se hace con un secreto compartido (webhook_secret) que Lithic te proporciona.

  // El evento de Lithic para autorizaciones en tiempo real suele ser 'authorization_request'
  if (body.type === 'authorization_request') {
    const auth = body.data;
    const cardToken = auth.card_token;
    const amount = auth.amount; // El importe suele venir en la unidad monetaria más pequeña (céntimos).

    const db = admin.firestore();

    // 1. Encontrar al usuario por el token de la tarjeta
    const usersSnap = await db.collection('users').where('lithicCardToken', '==', cardToken).limit(1).get();
    if (usersSnap.empty) {
      return NextResponse.json({ result: 'DECLINE', reason: 'CARD_NOT_FOUND' });
    }
    const userId = usersSnap.docs[0].id;

    // 2. Calcular saldo total (misma lógica que antes)
    const balancesSnap = await db.collection('users').doc(userId).collection('balances').get();
    let totalEur = 0;
    for (const doc of balancesSnap.docs) {
      const data = doc.data();
      if (data.amount && data.priceEur) totalEur += data.amount * data.priceEur;
    }

    // 3. Decidir
    const amountInEur = amount / 100; // Asumiendo que viene en céntimos.
    if (totalEur >= amountInEur) {
      // ✅ Aprobar
      // (Aquí también puedes ejecutar la transacción atómica para descontar el saldo, como ya tenías).
      return NextResponse.json({ result: 'APPROVE' });
    } else {
      // ❌ Rechazar
      return NextResponse.json({ result: 'DECLINE', reason: 'INSUFFICIENT_FUNDS' });
    }
  }

  return NextResponse.json({ received: true });
}
