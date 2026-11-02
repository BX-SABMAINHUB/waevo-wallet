import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// Mapeo de redes para BlockCypher
const NETWORKS: Record<string, string> = {
  LTC: 'ltc',
  BTC: 'btc',
  DOGE: 'doge',
};

// Inicialización de Firebase Admin
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
    const { symbol, userId } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    const chain = NETWORKS[upperSymbol];

    if (!upperSymbol || !userId || !chain) {
      return NextResponse.json({ error: 'Parámetros inválidos o red no soportada' }, { status: 400 });
    }

    const db = admin.firestore();
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc(upperSymbol);

    // 1. Si ya existe una billetera para esta moneda, la devolvemos
    const docSnap = await walletRef.get();
    if (docSnap.exists) {
      return NextResponse.json({ address: docSnap.data()?.address });
    }

    // 2. Si no existe, generamos una nueva con BlockCypher
    console.log(`[BlockCypher] Generando nueva dirección para ${upperSymbol}...`);
    const res = await fetch(`https://api.blockcypher.com/v1/${chain}/main/addrs`, {
      method: 'POST',
    });

    if (!res.ok) throw new Error('Error generando dirección en BlockCypher');
    const data = await res.json();

    // 3. Guardamos la dirección y la clave privada en Firestore
    await walletRef.set({
      address: data.public,
      privateKey: data.private, // 🔥 La clave WIF se guarda de forma segura en el backend
      createdAt: new Date().toISOString()
    });

    console.log(`[BlockCypher] Dirección creada: ${data.public}`);

    return NextResponse.json({ address: data.public });

  } catch (error: any) {
    console.error('🔥 [Error en generate-address]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
