import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1'; // 🔥 Usamos la librería sin WASM
import { ECPairFactory } from 'ecpair';
import * as admin from 'firebase-admin';

// Inicialización de la librería criptográfica
bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

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

const FEE_EUR = 0.01;
const FEE_ADDRESS = 'LXa3FdaEGGoTTTBeEB1SYKcRYx8rgUcwW7'; // Dirección de comisión

// Configuración manual de la red Litecoin para bitcoinjs-lib
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
    const { symbol, userId, toAddress, amount } = await request.json();
    const upperSymbol = symbol?.toUpperCase();
    const config = NETWORKS[upperSymbol];

    if (!config || !userId || !toAddress || !amount) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    // 1. Obtener la billetera (dirección y clave privada) desde Firestore
    const db = admin.firestore();
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc(upperSymbol);
    const walletDoc = await walletRef.get();

    if (!walletDoc.exists) {
      return NextResponse.json({ error: 'Billetera no encontrada. Genera una nueva dirección.' }, { status: 404 });
    }
    
    const { address: fromAddress, privateKey } = walletDoc.data()!;

    // 2. Calcular la comisión en cripto (0.01€)
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${config.coinId}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const feeCrypto = FEE_EUR / (priceData[config.coinId]?.eur || 1);
    
    const amountSatoshi = Math.round(parseFloat(amount) * 1e8);
    const feeSatoshi = Math.round(feeCrypto * 1e8);

    // 3. Solicitar a BlockCypher que construya la transacción
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
    
    // 🔥 CORRECCIÓN: Extraer el texto real del error de los objetos de BlockCypher
    if (!txRes.ok || (txData.errors && txData.errors.length > 0)) {
      const errorMessages = txData.errors
        ? txData.errors.map((e: any) => e.error || JSON.stringify(e)).join(' | ')
        : 'Fondos insuficientes o dirección inválida';
      
      return NextResponse.json({ 
        error: `BlockCypher: ${errorMessages}` 
      }, { status: 400 });
    }

    // 4. Firmar la transacción con la clave privada guardada en Firestore
    const keyPair = ECPair.fromWIF(privateKey, config.network);
    txData.pubkeys = [];
    txData.signatures = txData.tosign.map((tosign: string) => {
      const signature = keyPair.sign(Buffer.from(tosign, 'hex'));
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
      return encoded.toString('hex').slice(0, -2); // Quitamos el byte de sighash
    });

    // 5. Enviar la transacción firmada a la red
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
