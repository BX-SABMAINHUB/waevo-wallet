import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';

// ============================================================================
// CONFIGURACIÓN Y MAPEOS
// ============================================================================
const NATIVE_CHAINS: Record<string, string> = {
  BTC: 'bitcoin', LTC: 'litecoin', DOGE: 'dogecoin', BCH: 'bitcoin-cash',
  ADA: 'cardano', XRP: 'ripple', SOL: 'solana', DOT: 'polkadot',
  TRX: 'tron', XLM: 'stellar', XMR: 'monero', ZEC: 'zcash',
  DASH: 'dash', ETC: 'ethereum-classic', VET: 'vechain',
  ALGO: 'algorand', NEAR: 'near', ATOM: 'cosmos', FLOW: 'flow', EOS: 'eos',
};

// ============================================================================
// INICIALIZACIÓN DE FIREBASE ADMIN
// ============================================================================
if (!admin.apps.length) {
  try {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountString) {
      console.error('❌ FALTA LA VARIABLE FIREBASE_SERVICE_ACCOUNT');
      throw new Error('Configuración de Firebase incompleta');
    }

    const serviceAccount = JSON.parse(serviceAccountString);

    // 🔥 CRÍTICO: Arreglar los saltos de línea de la clave privada (típico error en Vercel)
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "waevo-wallet" // Forzamos el ID del proyecto
    });
    
    console.log('✅ Firebase Admin inicializado correctamente');
  } catch (error) {
    console.error('❌ Error inicializando Firebase Admin:', error);
  }
}

// ============================================================================
// CONEXIÓN A FIRESTORE
// ============================================================================
function getFirestoreInstance() {
  const db = admin.firestore();
  // 🔥 CRÍTICO: Forzar el uso de la base de datos por defecto para evitar el error 5 NOT_FOUND
  db.settings({ databaseId: '(default)' }); 
  return db;
}

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================
function getDeterministicIndex(userId: string, symbol: string): number {
  const hash = `${userId}-${symbol}`;
  let index = 0;
  for (let i = 0; i < hash.length; i++) {
    index = ((index << 5) - index) + hash.charCodeAt(i);
    index |= 0;
  }
  return Math.abs(index) % 2147483647;
}

// ============================================================================
// CONTROLADOR PRINCIPAL
// ============================================================================
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, userId } = body;
    const upperSymbol = symbol?.toUpperCase();
    
    if (!upperSymbol || !userId) {
      return NextResponse.json({ error: 'Faltan parámetros: symbol y userId son obligatorios' }, { status: 400 });
    }

    console.log(`[Generate-Address] Solicitud para ${upperSymbol} del usuario: ${userId}`);

    // 1. Conectar a Firestore y buscar si ya existe la billetera
    const db = getFirestoreInstance();
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc(upperSymbol);
    
    const docSnap = await walletRef.get();
    if (docSnap.exists) {
      const data = docSnap.data();
      if (data?.address) {
        console.log(`[Firestore] Dirección recuperada para ${upperSymbol}: ${data.address}`);
        return NextResponse.json({ address: data.address });
      }
    }

    console.log(`[Generate-Address] No existe dirección para ${upperSymbol}. Generando con Tatum...`);

    // 2. Si no existe, generarla con Tatum
    const chain = NATIVE_CHAINS[upperSymbol] || 'ethereum';
    const apiKey = process.env.TATUM_API_KEY;

    if (!apiKey) {
      throw new Error('TATUM_API_KEY no está configurada');
    }

    // Pedir wallet a Tatum
    const walletRes = await fetch(`https://api.tatum.io/v3/${chain}/wallet`, {
      method: 'GET',
      headers: { 'x-api-key': apiKey },
    });

    if (!walletRes.ok) {
      const errText = await walletRes.text();
      throw new Error(`Tatum error (wallet): ${walletRes.status} - ${errText}`);
    }
    
    const walletData = await walletRes.json();
    let address = '';

    // Tatum puede devolver un xpub (para UTXO) o una address directa
    if (walletData.xpub) {
      const index = getDeterministicIndex(userId, upperSymbol);
      const addressRes = await fetch(
        `https://api.tatum.io/v3/${chain}/address/${walletData.xpub}/${index}`,
        { method: 'GET', headers: { 'x-api-key': apiKey } }
      );
      
      if (!addressRes.ok) {
        const errText = await addressRes.text();
        throw new Error(`Tatum error (address): ${addressRes.status} - ${errText}`);
      }
      
      const addressData = await addressRes.json();
      address = addressData.address;
    } else if (walletData.address) {
      address = walletData.address;
    } else {
      throw new Error('Tatum no devolvió una dirección válida (ni xpub ni address)');
    }

    // 3. Guardar la nueva dirección en Firestore
    await walletRef.set({
      address: address,
      symbol: upperSymbol,
      createdAt: new Date().toISOString()
    });

    console.log(`[Firestore] Nueva dirección guardada para ${upperSymbol}: ${address}`);

    return NextResponse.json({ address });

  } catch (error: any) {
    console.error('🔥 [Error Crítico] en generate-address:', error.message);
    return NextResponse.json({ 
      error: error.message || 'Error interno generando la dirección' 
    }, { status: 500 });
  }
}
