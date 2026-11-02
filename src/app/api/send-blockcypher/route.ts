import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1'; // ECC sin WASM (funciona en Vercel)
import { ECPairFactory } from 'ecpair';
import * as admin from 'firebase-admin';

// 1. Inicialización de la librería criptográfica
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// 2. Inicialización de Firebase Admin
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

// 3. Configuración de comisiones y redes
const FEE_EUR = 0.01;
const FEE_ADDRESS = 'LXa3FdaEGGoTTTBeEB1SYKcRYx8rgUcwW7';

// Definimos la red de Litecoin manualmente (requerido en bitcoinjs-lib v6+)
const litecoinNetwork = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const NETWORKS: Record<string, { baseUrl: string; network: any; coinId: string; chain: string }> = {
  LTC: { baseUrl: 'https://api.blockcypher.com/v1/ltc/main', network: litecoinNetwork, coinId: 'litecoin', chain: 'ltc' },
  BTC: { baseUrl: 'https://api.blockcypher.com/v1/btc/main', network: bitcoin.networks.bitcoin, coinId: 'bitcoin', chain: 'btc' },
};

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { symbol, userId, toAddress, amount } = body;
    
    const upperSymbol = symbol?.toUpperCase();
    const config = NETWORKS[upperSymbol];

    // Validaciones básicas de entrada
    if (!config || !userId || !toAddress || !amount) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios o red no soportada.' }, { status: 400 });
    }

    // 4. Obtener la billetera desde Firestore
    const db = admin.firestore();
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc(upperSymbol);
    const walletDoc = await walletRef.get();

    if (!walletDoc.exists) {
      return NextResponse.json({ error: 'Billetera no encontrada en la base de datos.' }, { status: 404 });
    }
    
    const walletData = walletDoc.data()!;

    // 🔥 COMPROBACIÓN CRÍTICA: Evitar el error "Expected String"
    if (!walletData.privateKey) {
      return NextResponse.json({ 
        error: 'Esta es una dirección antigua generada sin clave privada. Para poder enviar fondos, debes borrar esta dirección en Firestore y generar una nueva en la sección "Recibir".' 
      }, { status: 400 });
    }

    const fromAddress = walletData.address;
    const privateKey = walletData.privateKey;

    // 5. Calcular la comisión de 0.01€ en criptomonedas
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${config.coinId}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[config.coinId]?.eur;

    if (!priceEur) {
      return NextResponse.json({ error: 'No se pudo obtener el precio actual de la moneda.' }, { status: 500 });
    }

    const feeCrypto = FEE_EUR / priceEur;
    const amountSatoshi = Math.round(parseFloat(amount) * 1e8);
    const feeSatoshi = Math.round(feeCrypto * 1e8);

    // 6. Solicitar a BlockCypher que construya la transacción
    const newTx = {
      inputs: [{ addresses: [fromAddress] }],
      outputs: [
        { addresses: [toAddress], value: amountSatoshi },
        { addresses: [FEE_ADDRESS], value: feeSatoshi },
      ],
    };

    const txRes = await fetch(`${config.baseUrl}/txs/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTx),
    });

    const txData = await txRes.json();
    
    // Manejo de errores de BlockCypher (Fondos insuficientes, etc.)
    if (!txRes.ok || (txData.errors && txData.errors.length > 0)) {
      const errorMessages = txData.errors
        ? txData.errors.map((e: any) => e.error || JSON.stringify(e)).join(' | ')
        : 'Fondos insuficientes o dirección inválida';
      
      return NextResponse.json({ error: `BlockCypher: ${errorMessages}` }, { status: 400 });
    }

    // 7. Firmar la transacción localmente
    const keyPair = ECPair.fromWIF(privateKey, config.network);
    txData.pubkeys = [];
    txData.signatures = txData.tosign.map((tosign: string) => {
      const signature = keyPair.sign(Buffer.from(tosign, 'hex'));
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
      return encoded.toString('hex').slice(0, -2); // Quitamos el byte de sighash
    });

    // 8. Enviar la transacción firmada a la red
    const sendRes = await fetch(`${config.baseUrl}/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    const finalTx = await sendRes.json();
    
    if (!sendRes.ok) {
      const sendErrorMessages = finalTx.errors
        ? finalTx.errors.map((e: any) => e.error || JSON.stringify(e)).join(' | ')
        : JSON.stringify(finalTx);
        
      return NextResponse.json({ error: `Error al enviar a la red: ${sendErrorMessages}` }, { status: 400 });
    }

    // 9. Devolver el éxito
    return NextResponse.json({
      txId: finalTx.tx.hash,
      explorerUrl: `https://live.blockcypher.com/${config.chain}/tx/${finalTx.tx.hash}/`
    });

  } catch (error: any) {
    console.error('🔥 [Error Crítico en send-blockcypher]:', error);
    return NextResponse.json({ 
      error: error.message || 'Error interno del servidor al procesar la transacción' 
    }, { status: 500 });
  }
}
