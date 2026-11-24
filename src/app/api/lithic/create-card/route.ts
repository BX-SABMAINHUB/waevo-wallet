import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

if (!admin.apps.length) {
  try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountString) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT');
    const serviceAccount = JSON.parse(serviceAccountString);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'waevo-wallet',
    });
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error);
  }
}

// Cliente mínimo para la API REST de Lithic (https://docs.lithic.com).
// La clave se lee en cada petición para que su ausencia no rompa el build.
const LITHIC_BASE_URL =
  process.env.LITHIC_ENVIRONMENT === 'production'
    ? 'https://api.lithic.com'
    : 'https://sandbox.lithic.com';

type LithicCard = { token: string; last_four: string };
type LithicAccountHolder = {
  token: string;
  account_token: string;
  status: 'ACCEPTED' | 'PENDING_REVIEW' | 'PENDING_DOCUMENT' | 'PENDING_RESUBMIT' | 'REJECTED';
};

async function lithicRequest<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.LITHIC_API_KEY;
  if (!apiKey) throw new Error('Falta LITHIC_API_KEY');

  const res = await fetch(`${LITHIC_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store',
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    throw new Error(`Lithic ${res.status}: ${data?.message ?? data?.debugging_request_id ?? text}`);
  }
  return data as T;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    if (!userId || typeof userId !== 'string') {
      return NextResponse.json({ error: 'Falta userId' }, { status: 400 });
    }

    const db = admin.firestore();

    // 1. Verificar acceso aprobado
    const requestSnap = await db.collection('cardRequests').doc(userId).get();
    if (!requestSnap.exists || requestSnap.data()?.approved !== true) {
      return NextResponse.json({ error: 'Acceso no aprobado' }, { status: 403 });
    }

    const userSnap = await db.collection('users').doc(userId).get();
    const userData = userSnap.data() ?? {};

    // Si la tarjeta ya existe, devolverla en vez de crear otra
    if (userData.lithicCardToken) {
      const existing = await lithicRequest<LithicCard>(
        'GET',
        `/v1/cards/${encodeURIComponent(userData.lithicCardToken)}`,
      );
      return NextResponse.json({ card: { id: existing.token, last4: existing.last_four } });
    }

    // 2. Crear el Account Holder en Lithic (si no existe ya)
    let accountToken: string | undefined = userData.lithicAccountToken;
    let accountHolderToken: string | undefined = userData.lithicAccountHolderToken;

    if (!accountToken) {
      const address = userData.address ?? {};
      const holderData = {
        first_name: str(userData.firstName ?? userData.first_name),
        last_name: str(userData.lastName ?? userData.last_name),
        email: str(userData.email),
        phone_number: str(userData.phoneNumber ?? userData.phone),
        address: {
          address1: str(address.address1 ?? address.line1 ?? address.street),
          address2: str(address.address2 ?? address.line2) || undefined,
          city: str(address.city),
          state: str(address.state) || undefined,
          postal_code: str(address.postal_code ?? address.postalCode ?? address.zip) || undefined,
          country: str(address.country),
        },
      };

      const missing = [
        !holderData.first_name && 'firstName',
        !holderData.last_name && 'lastName',
        !holderData.email && 'email',
        !holderData.phone_number && 'phoneNumber',
        !holderData.address.address1 && 'address.address1',
        !holderData.address.city && 'address.city',
        !holderData.address.country && 'address.country',
      ].filter(Boolean);
      if (missing.length) {
        return NextResponse.json(
          { error: `Faltan datos del usuario: ${missing.join(', ')}` },
          { status: 400 },
        );
      }

      const accountHolder = await lithicRequest<LithicAccountHolder>('POST', '/v1/account_holders', {
        workflow: 'KYC_EXEMPT',
        kyc_exemption_type: 'PREPAID_CARD_USER',
        external_id: userId,
        ...holderData,
      });

      if (accountHolder.status !== 'ACCEPTED') {
        return NextResponse.json(
          { error: `Verificación pendiente o rechazada: ${accountHolder.status}` },
          { status: 409 },
        );
      }

      accountToken = accountHolder.account_token;
      accountHolderToken = accountHolder.token;
    }

    // 3. Crear la tarjeta virtual
    const card = await lithicRequest<LithicCard>('POST', '/v1/cards', {
      account_token: accountToken,
      type: 'VIRTUAL',
      state: 'OPEN',
    });

    // 4. Guardar tokens en Firestore para futuras referencias y para el webhook
    await db.collection('users').doc(userId).set(
      {
        lithicAccountHolderToken: accountHolderToken ?? null,
        lithicAccountToken: accountToken,
        lithicCardToken: card.token,
      },
      { merge: true },
    );

    return NextResponse.json({
      card: {
        id: card.token,
        last4: card.last_four,
      },
    });
  } catch (e: any) {
    console.error('Error creando tarjeta en Lithic:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
