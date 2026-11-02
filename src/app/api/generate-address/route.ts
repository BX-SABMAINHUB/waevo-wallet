import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

export const dynamic = 'force-dynamic';

const NETWORKS: Record<string, string> = {
  LTC: 'ltc',
  BTC: 'btc',
  DOGE: 'doge',
};

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
      projectId: "waevo-wallet"
    });
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error);
  }
}

export async function POST(request: Request) {
  try {
    const { symbol, userId } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    const chain = NETWORKS[upperSymbol];

    if (!upperSymbol || !userId || !chain) {
      return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 });
    }

    const db = admin.firestore();
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc(upperSymbol);

    // 1. Buscar en Firestore
    const docSnap = await walletRef.get();
    
    if (docSnap.exists) {
      const savedAddress = docSnap.data()?.address;
      
      // 🔥 AUTO-CORRECCIÓN: Si la dirección guardada no parece válida (es un hash de clave pública o Tatum)
      // Las direcciones reales de LTC/BTC no miden 66 caracteres ni empiezan por 02/03.
      if (savedAddress && savedAddress.length < 50 && !savedAddress.startsWith('02') && !savedAddress.startsWith('03')) {
        console.log(`[Firestore] Dirección válida recuperada: ${savedAddress}`);
        return NextResponse.json({ address: savedAddress });
      } else {
        console.log(`[Firestore] ⚠️ Dirección inválida detectada (${savedAddress}). Generando una nueva...`);
        // Si es inválida, no la devolvemos. Pasamos al paso 2 para generar una nueva.
      }
    }

    // 2. Generar nueva dirección con BlockCypher
    console.log(`[BlockCypher] Solicitando nueva dirección para ${upperSymbol}...`);
    const res = await fetch(`https://api.blockcypher.com/v1/${chain}/main/addrs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) throw new Error('Error generando dirección en BlockCypher');
    const data = await res.json();

    // 3. Guardar la dirección REAL (data.address) en Firestore
    // Al usar { merge: true }, sobrescribimos el registro inválido si ya existía.
    await walletRef.set({
      address: data.address, 
      privateKey: data.private, 
      createdAt: new Date().toISOString()
    }, { merge: true });

    console.log(`[BlockCypher] Nueva dirección guardada: ${data.address}`);

    return NextResponse.json({ address: data.address });

  } catch (error: any) {
    console.error('🔥 [Error en generate-address]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
