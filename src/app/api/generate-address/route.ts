import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// 🔥 CRÍTICO: Obliga a Next.js a ejecutar esta API en cada petición, sin usar caché.
export const dynamic = 'force-dynamic';

// Mapeo de redes soportadas por BlockCypher
const NETWORKS: Record<string, string> = {
  LTC: 'ltc',
  BTC: 'btc',
  DOGE: 'doge',
};

// Inicialización robusta de Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountString) throw new Error('Falta FIREBASE_SERVICE_ACCOUNT');

    const serviceAccount = JSON.parse(serviceAccountString);
    
    // Limpieza de la clave privada (evita errores de saltos de línea en Vercel)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "waevo-wallet"
    });
    console.log('✅ Firebase Admin inicializado en generate-address');
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

    // 1. Comprobar si ya existe una billetera guardada en Firestore
    const docSnap = await walletRef.get();
    if (docSnap.exists) {
      console.log(`[Firestore] Dirección recuperada para ${upperSymbol}: ${docSnap.data()?.address}`);
      return NextResponse.json({ address: docSnap.data()?.address });
    }

    // 2. Si no existe, generamos una nueva con BlockCypher
    console.log(`[BlockCypher] Generando nueva dirección para ${upperSymbol}...`);
    const res = await fetch(`https://api.blockcypher.com/v1/${chain}/main/addrs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[BlockCypher] Error ${res.status}: ${errText}`);
      throw new Error('Error generando dirección en BlockCypher');
    }
    
    const data = await res.json();

    // 3. Guardamos la dirección REAL (data.address) y la clave privada WIF (data.private)
    await walletRef.set({
      address: data.address,    // 🔥 Aquí está la corrección (antes ponía data.public)
      privateKey: data.private, // La clave WIF se guarda de forma segura en el backend
      createdAt: new Date().toISOString()
    });

    console.log(`[BlockCypher] Dirección creada y guardada: ${data.address}`);

    // 4. Devolvemos la dirección real al frontend
    return NextResponse.json({ address: data.address });

  } catch (error: any) {
    console.error('🔥 [Error en generate-address]:', error.message);
    return NextResponse.json({ error: error.message || 'Error interno generando dirección' }, { status: 500 });
  }
}
