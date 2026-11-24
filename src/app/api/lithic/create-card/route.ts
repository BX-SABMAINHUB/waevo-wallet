import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

async function lithicPost(path: string, body: Record<string, unknown>): Promise<any> {
  const res = await fetch(`https://api.lithic.com/v1${path}`, {
    method: 'POST',
    headers: { Authorization: process.env.LITHIC_API_KEY ?? '', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.message || `Lithic error ${res.status}`);
  return data;
}

// ... inicialización de Firebase Admin ...

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    const db = admin.firestore();

    // 1. Verificar acceso aprobado (igual que antes)
    const requestSnap = await db.collection('cardRequests').doc(userId).get();
    if (!requestSnap.exists || requestSnap.data()?.approved !== true) {
      return NextResponse.json({ error: 'Acceso no aprobado' }, { status: 403 });
    }

    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data();

    // 2. Crear el "Cardholder" en Lithic
    // Asumiendo que usas KYC_BYO o que tus usuarios ya están verificados.
    const cardholder = await lithicPost('/account_holders', {
      type: 'INDIVIDUAL',
      // ... datos del usuario (nombre, email, etc.) ...
      kyc_exemption_type: 'KYC_BYO', // O el tipo que corresponda
      // ...
    });

    // 3. Crear la tarjeta virtual
    const card = await lithicPost('/cards', {
      account_token: cardholder.account_token ?? cardholder.token, // o el ID que devuelva
      type: 'VIRTUAL',
      state: 'OPEN',
      // ...
    });

    // 4. Guardar IDs en Firestore para futuras referencias y para el webhook
    await db.collection('users').doc(userId).set({
      lithicCardholderToken: cardholder.token,
      lithicCardToken: card.token,
      // ...
    }, { merge: true });

    return NextResponse.json({
      card: {
        id: card.token,
        last4: card.last_four,
        // ...
      }
    });

  } catch (e: any) {
    console.error('Error creando tarjeta en Lithic:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
