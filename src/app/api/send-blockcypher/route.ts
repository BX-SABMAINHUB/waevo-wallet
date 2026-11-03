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

    if (!privateKey) {
      return NextResponse.json({ error: 'La billetera no tiene clave privada.' }, { status: 400 });
    }

    // 🔥 LA MAGIA: Soportar tanto WIF como Hexadecimal
    let keyPair;
    try {
      // 1. Intentamos como Hexadecimal (por si BlockCypher la guardó así)
      // Quitamos '0x' si existe al principio
      const hexKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      
      if (hexKey.length === 64) {
        // Es una clave hexadecimal (64 caracteres)
        keyPair = ECPair.fromPrivateKey(Buffer.from(hexKey, 'hex'), { network: config.network });
      } else {
        // 2. Si no es hex, intentamos como WIF (formato tradicional)
        keyPair = ECPair.fromWIF(privateKey, config.network);
      }
    } catch (error: any) {
      return NextResponse.json({ 
        error: `Error con el formato de la clave privada. Por favor, genera una nueva billetera en "Recibir" para empezar limpio.` 
      }, { status: 400 });
    }

    // Calcular comisiones
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${config.coinId}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[config.coinId]?.eur;

    if (!priceEur) throw new Error('No se pudo obtener el precio actual de la moneda.');

    const amountFloat = parseFloat(amount);
    const amountEur = amountFloat * priceEur;

    if (amountEur < 0.03) return NextResponse.json({ error: 'El monto mínimo a enviar es de 0.03 €.' }, { status: 400 });
    if (amountEur > 50) return NextResponse.json({ error: 'El monto máximo a enviar es de 50.00 €.' }, { status: 400 });

    const feeEur = amountEur <= 5 ? 0.01 : amountEur * 0.025;
    const feeCrypto = feeEur / priceEur;
    
    const amountSatoshi = Math.round(amountFloat * 1e8);
    const feeSatoshi = Math.round(feeCrypto * 1e8);

    // Construir transacción
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
      const errorMessages = txData.errors ? txData.errors.map((e: any) => e.error || JSON.stringify(e)).join(' | ') : 'Fondos insuficientes o dirección inválida';
      return NextResponse.json({ error: `BlockCypher: ${errorMessages}` }, { status: 400 });
    }

    // Firmar
    txData.pubkeys = [];
    txData.signatures = txData.tosign.map((tosign: string) => {
      const signature = keyPair.sign(Buffer.from(tosign, 'hex'));
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
      return encoded.toString('hex').slice(0, -2);
    });

    // Enviar
    const sendRes = await fetch(`${config.baseUrl}/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    const finalTx = await sendRes.json();
    
    if (!sendRes.ok) {
      const sendErrorMessages = finalTx.errors ? finalTx.errors.map((e: any) => e.error || JSON.stringify(e)).join(' | ') : JSON.stringify(finalTx);
      return NextResponse.json({ error: `Error al enviar: ${sendErrorMessages}` }, { status: 400 });
    }

    // Descontar saldo en Firebase
    const balanceRef = db.collection('users').doc(userId).collection('balances').doc(upperSymbol);
    await balanceRef.set({
      amount: admin.firestore.FieldValue.increment(-(amountFloat + feeCrypto))
    }, { merge: true });

    return NextResponse.json({
      txId: finalTx.tx.hash,
      explorerUrl: `https://live.blockcypher.com/${config.chain}/tx/${finalTx.tx.hash}/`
    });

  } catch (error: any) {
    console.error('🔥 [Error Crítico en send-blockcypher]:', error);
    return NextResponse.json({ error: error.message || 'Error interno del servidor' }, { status: 500 });
  }
}
