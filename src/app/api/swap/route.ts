import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import * as admin from 'firebase-admin';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

const litecoinNetwork = {
  messagePrefix: '\x19Litecoin Signed Message:\n',
  bech32: 'ltc',
  bip32: { public: 0x019da462, private: 0x019d9cfe },
  pubKeyHash: 0x30,
  scriptHash: 0x32,
  wif: 0xb0,
};

const NETWORKS: Record<string, { blockcypher: string; network: any }> = {
  LTC: { blockcypher: 'ltc', network: litecoinNetwork },
  BTC: { blockcypher: 'btc', network: bitcoin.networks.bitcoin },
};

const FIXEDFLOAT_API_KEY = process.env.FIXEDFLOAT_API_KEY;
const FIXEDFLOAT_API_SECRET = process.env.FIXEDFLOAT_API_SECRET;

function signFixedFloat(data: string): string {
  return crypto.createHmac('sha256', FIXEDFLOAT_API_SECRET!).update(data).digest('hex');
}

async function fixedFloatRequest(method: string, params: any) {
  const data = JSON.stringify(params);
  const signature = signFixedFloat(data);

  const res = await fetch(`https://ff.io/api/v2/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-API-KEY': FIXEDFLOAT_API_KEY!,
      'X-API-SIGN': signature,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
    body: data,
  });

  const text = await res.text();

  try {
    const json = JSON.parse(text);
    if (json.code !== 0) {
      console.error(`[FixedFloat Error] Código: ${json.code}, Mensaje: ${json.msg || 'Sin mensaje'}`);
      
      // 🔥 MANEJO ESPECÍFICO PARA ERROR 300
      if (json.code === 300 || json.msg === 'Internal error') {
        throw new Error('El intercambio no está disponible en tu región en este momento. Por favor, inténtalo más tarde o contacta con soporte.');
      }
      
      throw new Error(`FixedFloat: ${json.msg || 'Error en la petición'}`);
    }
    return json.data;
  } catch (error) {
    console.error(`[FixedFloat Crash] Status: ${res.status}. Respuesta recibida:`, text.substring(0, 300));
    throw new Error(`FixedFloat devolvió un error inesperado (Status ${res.status}). Revisa los logs.`);
  }
}

export async function POST(request: Request) {
  try {
    const { userId, fromSymbol, toSymbol, amount } = await request.json();
    const upperFrom = fromSymbol?.toUpperCase();
    const upperTo = toSymbol?.toUpperCase();
    const fromConfig = NETWORKS[upperFrom];

    if (!fromConfig || !userId || !amount) {
      return NextResponse.json({ error: 'Faltan parámetros o red no soportada' }, { status: 400 });
    }

    const db = admin.firestore();
    
    const fromWalletRef = db.collection('users').doc(userId).collection('wallets').doc(upperFrom);
    const fromWalletDoc = await fromWalletRef.get();
    if (!fromWalletDoc.exists) {
      return NextResponse.json({ error: `No tienes una billetera de ${upperFrom}.` }, { status: 404 });
    }
    const fromWallet = fromWalletDoc.data()!;

    const toWalletRef = db.collection('users').doc(userId).collection('wallets').doc(upperTo);
    let toWalletDoc = await toWalletRef.get();
    let toAddress = toWalletDoc.exists ? toWalletDoc.data()?.address : null;

    if (!toAddress) {
      console.log(`[Swap] Generando nueva billetera para ${upperTo}...`);
      const genRes = await fetch(`https://api.blockcypher.com/v1/${NETWORKS[upperTo]?.blockcypher || 'btc'}/main/addrs`, { method: 'POST' });
      const genData = await genRes.json();
      toAddress = genData.address;
      await toWalletRef.set({ address: toAddress, privateKey: genData.private, createdAt: new Date().toISOString() });
      console.log(`[Swap] Billetera ${upperTo} creada: ${toAddress}`);
    }

    const orderParams = {
      fromCcy: upperFrom,
      toCcy: upperTo,
      amount: parseFloat(amount),
      direction: 'from',
      type: 'float',
      toAddress: toAddress,
    };

    console.log(`[FixedFloat] Creando orden...`);
    const orderData = await fixedFloatRequest('create', orderParams);

    const depositAddress = orderData.from.address;
    const expectedReceive = orderData.to.amount;
    const orderId = orderData.id;

    console.log(`[FixedFloat] Orden ${orderId} creada. Depositar en: ${depositAddress}`);

    const privateKey = fromWallet.privateKey;
    if (!privateKey) return NextResponse.json({ error: 'Clave privada de origen no válida' }, { status: 400 });

    let keyPair;
    try {
      const hexKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      if (hexKey.length === 64) {
        keyPair = ECPair.fromPrivateKey(Buffer.from(hexKey, 'hex'), { network: fromConfig.network });
      } else {
        keyPair = ECPair.fromWIF(privateKey, fromConfig.network);
      }
    } catch (e) {
      return NextResponse.json({ error: 'Error leyendo clave privada. Genera una nueva billetera.' }, { status: 400 });
    }

    const amountSatoshi = Math.round(parseFloat(amount) * 1e8);

    const newTx = {
      inputs: [{ addresses: [fromWallet.address] }],
      outputs: [{ addresses: [depositAddress], value: amountSatoshi }],
    };

    const txRes = await fetch(`https://api.blockcypher.com/v1/${fromConfig.blockcypher}/main/txs/new`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newTx),
    });

    const txData = await txRes.json();
    if (!txRes.ok || (txData.errors && txData.errors.length > 0)) {
      const err = txData.errors ? txData.errors.map((e: any) => e.error).join(' | ') : 'Error de red';
      return NextResponse.json({ error: `BlockCypher: ${err}` }, { status: 400 });
    }

    txData.pubkeys = [];
    txData.signatures = txData.tosign.map((tosign: string) => {
      const signature = keyPair.sign(Buffer.from(tosign, 'hex'));
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
      return encoded.toString('hex').slice(0, -2);
    });

    const sendRes = await fetch(`https://api.blockcypher.com/v1/${fromConfig.blockcypher}/main/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    const finalTx = await sendRes.json();
    if (!sendRes.ok) {
      return NextResponse.json({ error: `Error al enviar a FixedFloat: ${JSON.stringify(finalTx.errors)}` }, { status: 400 });
    }

    const fromBalanceRef = db.collection('users').doc(userId).collection('balances').doc(upperFrom);
    const toBalanceRef = db.collection('users').doc(userId).collection('balances').doc(upperTo);

    await db.runTransaction(async (t) => {
      const fromDoc = await t.get(fromBalanceRef);
      const currentFrom = fromDoc.exists ? fromDoc.data()?.amount || 0 : 0;
      if (currentFrom < parseFloat(amount)) throw new Error('Saldo insuficiente');

      const toDoc = await t.get(toBalanceRef);
      const currentTo = toDoc.exists ? toDoc.data()?.amount || 0 : 0;

      t.set(fromBalanceRef, { amount: currentFrom - parseFloat(amount) }, { merge: true });
      t.set(toBalanceRef, { amount: currentTo + parseFloat(expectedReceive) }, { merge: true });
    });

    return NextResponse.json({
      success: true,
      message: `Intercambio en proceso. Enviaste ${amount} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}.`,
      txHash: finalTx.tx.hash,
      orderId,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
