import { NextResponse } from 'next/server';
import { getAdmin } from '@/lib/firebase-admin';
import { lithicRequest } from '@/lib/lithic';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type LithicCard = {
  token: string;
  last_four: string;
  account_token?: string;
};

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId es obligatorio' }, { status: 400 });
    }

    const db = getAdmin().firestore();

    // 1. Verificar que el acceso a la tarjeta está aprobado
    const requestSnap = await db.collection('cardRequests').doc(userId).get();
    if (!requestSnap.exists || requestSnap.data()?.approved !== true) {
      return NextResponse.json({ error: 'Acceso no aprobado' }, { status: 403 });
    }

    const userRef = db.collection('users').doc(userId);
    const userData = (await userRef.get()).data() || {};

    // 2. Si el usuario ya tiene tarjeta, devolverla en lugar de crear otra
    if (userData.lithicCardToken) {
      const existing = await lithicRequest<LithicCard>('GET', `/cards/${userData.lithicCardToken}`);
      return NextResponse.json({ card: { id: existing.token, last4: existing.last_four } });
    }

    // 3. Crear la tarjeta virtual en Lithic
    const card = await lithicRequest<LithicCard>('POST', '/cards', {
      type: 'VIRTUAL',
      state: 'OPEN',
      ...(userData.lithicAccountToken ? { account_token: userData.lithicAccountToken } : {}),
    });

    // 4. Guardar los identificadores para futuras consultas y para el webhook
    await userRef.set(
      {
        lithicCardToken: card.token,
        ...(card.account_token ? { lithicAccountToken: card.account_token } : {}),
      },
      { merge: true }
    );

    return NextResponse.json({ card: { id: card.token, last4: card.last_four } });
  } catch (e: any) {
    console.error('Error creando tarjeta en Lithic:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
