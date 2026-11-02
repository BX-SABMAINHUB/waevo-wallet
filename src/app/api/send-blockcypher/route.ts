import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import * as admin from 'firebase-admin';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

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
const FEE_ADDRESS = 'LXa3FdaEGGoTTTBeEB1SYKcRYx8rgUcwW7';

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

    const db = admin.firestore();
    const walletRef = db.collection('users').doc(userId).collection('wallets').doc(upperSymbol);
    const walletDoc = await walletRef.get();

    if (!walletDoc.exists) {
      return NextResponse.json({ error: 'Billetera no encontrada. Genera una nueva dirección.' }, { status: 404 });
    }
    
    const walletData = walletDoc.data()!;
    const fromAddress = walletData.address;
    let privateKey = walletData.privateKey ? walletData.privateKey.trim() : '';

    // 🔥 1. VALIDACIÓN DE SEGURIDAD EXTREMA
    // Si la clave está vacía, empieza por 02/03 (clave pública) o mide 66 caracteres, es inválida.
    if (!privateKey || privateKey.startsWith('02') || privateKey.startsWith('03') || privateKey.length === 66) {
      return NextResponse.json({ 
        error: 'La base de datos contiene una CLAVE PÚBLICA en lugar de una privada. Por favor, borra esta billetera en Firestore (usuarios > tu UID > wallets > LTC) y vuelve a generarla en "Recibir".' 
      }, { status: 400 });
    }

    let keyPair;
    try {
      // Intentamos leerla como WIF (formato estándar de Litecoin)
      keyPair = ECPair.fromWIF(privateKey, config.network);
    } catch (errorWIF: any) {
      try {
        // Si falla, intentamos leerla como Hexadecimal (por si BlockCypher la devolvió así)
        const hexKey = privateKey.replace('0x', '');
        keyPair = ECPair.fromPrivateKey(Buffer.from(hexKey, 'hex'), { network: config.network });
      } catch (errorHex: any) {
        return NextResponse.json({ 
          error: `La clave privada guardada no es válida. Detalle: ${errorWIF.message}. Borra la billetera en Firestore y genera una nueva.` 
        }, { status: 400 });
      }
    }

    // 2. Calcular la comisión
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${config.coinId}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const feeCrypto = FEE_EUR / (priceData[config.coinId]?.eur || 1);
    
    const amountSatoshi = Math.round(parseFloat(amount) * 1e8);
    const feeSatoshi = Math.round(feeCrypto * 1e8);

    // 3. Construir transacción
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
    
    if (!txRes.ok || (txData.errors && txData.errors.length > 0)) {
      const errorMessages = txData.errors
        ? txData.errors.map((e: any) => e.error || JSON.stringify(e)).join(' | ')
        : 'Fondos insuficientes o dirección inválida';
      return NextResponse.json({ error: `BlockCypher: ${errorMessages}` }, { status: 400 });
    }

    // 4. Firmar
    txData.pubkeys = [];
    txData.signatures = txData.tosign.map((tosign: string) => {
      const signature = keyPair.sign(Buffer.from(tosign, 'hex'));
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
      return encoded.toString('hex').slice(0, -2);
    });

    // 5. Enviar
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
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
