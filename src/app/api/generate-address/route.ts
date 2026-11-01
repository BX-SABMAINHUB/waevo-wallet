import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

const NATIVE_CHAINS: Record<string, string> = {
  BTC: 'bitcoin', LTC: 'litecoin', DOGE: 'dogecoin', BCH: 'bitcoin-cash',
  ADA: 'cardano', XRP: 'ripple', SOL: 'solana', DOT: 'polkadot',
  TRX: 'tron', XLM: 'stellar', XMR: 'monero', ZEC: 'zcash',
  DASH: 'dash', ETC: 'ethereum-classic', VET: 'vechain',
  ALGO: 'algorand', NEAR: 'near', ATOM: 'cosmos', FLOW: 'flow', EOS: 'eos',
};

// Inicialización robusta de Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    
    // 🔥 CRÍTICO: Arreglar los saltos de línea de la clave privada si Vercel los guardó como texto
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "waevo-wallet" // Forzamos el ID del proyecto por seguridad
    });
    console.log('✅ Firebase Admin inicializado correctamente');
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error);
  }
}

// Función para conectar a Firestore (sin parámetros extra)
function getFirestoreInstance() {
  return admin.firestore(); 
}

function getDeterministicIndex(userId: string, symbol: string): number {
  const hash = `${userId}-${symbol}`;
  let index = 0;
  for (let i = 0; i < hash.length; i++) {
    index = ((index << 5) - index) + hash.charCodeAt(i);
    index |= 0;
  }
  return Math.abs(index) % 2147483647;
}

export async function POST(request: Request) {
  try {
    const { symbol, userId } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    
    if (!upperSymbol || !userId) {
      return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 });
    }

    const db = getFirestoreInstance();
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc(upperSymbol);
    
    // 1. Comprobar si ya existe en Firestore
    const docSnap = await walletRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data?.address) {
        console.log(`[Firestore] Dirección recuperada para ${upperSymbol}: ${data.address}`);
        return NextResponse.json({ address: data.address });
      }
    }

    // 2. Si no existe, generarla con Tatum
    const chain = NATIVE_CHAINS[upperSymbol] || 'ethereum';
    const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
      method: 'GET',
      headers: { 'x-api-key': process.env.TATUM_API_KEY! },
    });

    if (!walletRes.ok) throw new Error(`Tatum error: ${walletRes.status}`);
    const walletData = await walletRes.json();

    let address = '';
    if (walletData.xpub) {
      const index = getDeterministicIndex(userId, upperSymbol);
      const addressRes = await fetch(
        `https://api.tatum.io/v3/${chain}/address/${walletData.xpub}/${index}`,
        { method: 'GET', headers: { 'x-api-key': process.env.TATUM_API_KEY! } }
      );
      if (!addressRes.ok) throw new Error(`Tatum address error: ${addressRes.status}`);
      const addressData = await addressRes.json();
      address = addressData.address;
    } else if (walletData.address) {
      address = walletData.address;
    } else {
      throw new Error('Tatum no devolvió una dirección válida');
    }

    // 3. Guardar en Firestore
    await walletRef.set({
      address: address,
      symbol: upperSymbol,
      createdAt: new Date().toISOString()
    });

    console.log(`[Firestore] Nueva dirección guardada para ${upperSymbol}: ${address}`);

    return NextResponse.json({ address });

  } catch (error: any) {
    console.error('🔥 Error en generate-address:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
