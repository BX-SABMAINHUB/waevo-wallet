// src/app/api/swap/route.ts
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

// --- Inicialización de Firebase Admin (sin cambios) ---
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

// --- Redes soportadas (LTC y BTC) ---
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

const FIXEDFLOAT_API_KEY = process.env.FIXEDFLOAT_API_KEY!;
const FIXEDFLOAT_API_SECRET = process.env.FIXEDFLOAT_API_SECRET!;

// --- Firma HMAC-SHA256 (idéntica a la documentación oficial) ---
function signFixedFloat(data: string): string {
  return crypto
    .createHmac('sha256', FIXEDFLOAT_API_SECRET)
    .update(data, 'utf8')
    .digest('hex');
}

/**
 * Llama a la API v2 de FixedFloat.
 * @param method - Nombre del método (ej. 'create', 'price', 'getOrder')
 * @param params - Objeto de parámetros que se serializará a JSON
 */
async function fixedFloatRequest(method: string, params: any) {
  const data = JSON.stringify(params);
  const signature = signFixedFloat(data);

  const res = await fetch(`https://ff.io/api/v2/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-API-KEY': FIXEDFLOAT_API_KEY,
      'X-API-SIGN': signature,
    },
    body: data,
  });

  const text = await res.text();
  let json: any;

  try {
    json = JSON.parse(text);
  } catch {
    console.error(`[FixedFloat] Respuesta no JSON (HTTP ${res.status}):`, text.substring(0, 300));
    throw new Error(`FixedFloat devolvió una respuesta inesperada (HTTP ${res.status}).`);
  }

  if (json.code !== 0) {
    // Manejo específico para el código 300 (región bloqueada / error interno)
    if (json.code === 300 || json.msg === 'Internal error') {
      throw new Error('El intercambio no está disponible en tu región en este momento. Inténtalo más tarde o contacta con soporte.');
    }
    throw new Error(`FixedFloat: ${json.msg || 'Error en la petición'}`);
  }

  return json.data;
}

export async function POST(request: Request) {
  try {
    const { userId, fromSymbol, toSymbol, amount } = await request.json();
    const upperFrom = fromSymbol?.toUpperCase();
    const upperTo = toSymbol?.toUpperCase();
    const fromConfig = NETWORKS[upperFrom];

    // --- Validaciones básicas ---
    if (!fromConfig || !userId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Faltan parámetros o red no soportada' }, { status: 400 });
    }

    const db = admin.firestore();

    // --- 1. Obtener wallet de origen ---
    const fromWalletRef = db.collection('users').doc(userId).collection('wallets').doc(upperFrom);
    const fromWalletDoc = await fromWalletRef.get();
    if (!fromWalletDoc.exists) {
      return NextResponse.json({ error: `No tienes una billetera de ${upperFrom}.` }, { status: 404 });
    }
    const fromWallet = fromWalletDoc.data()!;
    const privateKey = fromWallet.privateKey;
    if (!privateKey) {
      return NextResponse.json({ error: 'Clave privada de origen no válida' }, { status: 400 });
    }

    // --- 2. Obtener o crear wallet de destino ---
    const toWalletRef = db.collection('users').doc(userId).collection('wallets').doc(upperTo);
    let toWalletDoc = await toWalletRef.get();
    let toAddress = toWalletDoc.exists ? toWalletDoc.data()?.address : null;

    if (!toAddress) {
      const toConfig = NETWORKS[upperTo];
      if (!toConfig) {
        return NextResponse.json({ error: `Red de destino ${upperTo} no soportada.` }, { status: 400 });
      }
      const genRes = await fetch(`https://api.blockcypher.com/v1/${toConfig.blockcypher}/main/addrs`, { method: 'POST' });
      const genData = await genRes.json();
      toAddress = genData.address;
      await toWalletRef.set({ address: toAddress, privateKey: genData.private, createdAt: new Date().toISOString() });
    }

    // --- 3. Crear orden en FixedFloat ---
    const orderParams = {
      fromCcy: upperFrom,
      toCcy: upperTo,
      amount: parseFloat(amount),
      direction: 'from',   // 'from' = el amount es la cantidad que se envía
      type: 'float',       // 'float' o 'fixed'
      toAddress: toAddress,
    };

    const orderData = await fixedFloatRequest('create', orderParams);

    // La respuesta de FixedFloat tiene esta estructura (según docs oficiales):
    // orderData.from.address  -> dirección de depósito
    // orderData.to.amount     -> cantidad estimada a recibir
    // orderData.id            -> ID de la orden
    const depositAddress = orderData.from?.address;
    const expectedReceive = orderData.to?.amount;
    const orderId = orderData.id;

    if (!depositAddress) {
      throw new Error('FixedFloat no devolvió una dirección de depósito válida.');
    }

    // --- 4. Construir y firmar la transacción on-chain ---
    // Convertimos la cantidad a satoshis (1e8)
    const amountSatoshi = Math.round(parseFloat(amount) * 1e8);

    // Preparamos la transacción para BlockCypher
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
      const errMsg = txData.errors?.map((e: any) => e.error).join(' | ') || 'Error de red';
      throw new Error(`BlockCypher: ${errMsg}`);
    }

    // --- 5. Firmar cada hash "tosign" ---
    let keyPair;
    try {
      const hexKey = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
      if (hexKey.length === 64) {
        keyPair = ECPair.fromPrivateKey(Buffer.from(hexKey, 'hex'), { network: fromConfig.network });
      } else {
        keyPair = ECPair.fromWIF(privateKey, fromConfig.network);
      }
    } catch (e) {
      throw new Error('Error leyendo clave privada. Genera una nueva billetera.');
    }

    txData.pubkeys = [];
    txData.signatures = txData.tosign.map((tosign: string) => {
      const signature = keyPair.sign(Buffer.from(tosign, 'hex'));
      // Codificamos la firma en formato DER + SIGHASH_ALL
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
      // BlockCypher espera la firma sin el byte de SIGHASH al final
      return encoded.toString('hex').slice(0, -2);
    });

    // --- 6. Enviar transacción firmada a BlockCypher ---
    const sendRes = await fetch(`https://api.blockcypher.com/v1/${fromConfig.blockcypher}/main/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    const finalTx = await sendRes.json();
    if (!sendRes.ok) {
      const errDetail = JSON.stringify(finalTx.errors || finalTx);
      throw new Error(`Error al enviar a FixedFloat: ${errDetail}`);
    }

    // --- 7. Actualizar saldos en Firestore (transacción atómica) ---
    const fromBalanceRef = db.collection('users').doc(userId).collection('balances').doc(upperFrom);
    const toBalanceRef = db.collection('users').doc(userId).collection('balances').doc(upperTo);

    await db.runTransaction(async (t) => {
      const fromDoc = await t.get(fromBalanceRef);
      const currentFrom = fromDoc.exists ? fromDoc.data()?.amount || 0 : 0;
      if (currentFrom < parseFloat(amount)) {
        throw new Error('Saldo insuficiente');
      }

      const toDoc = await t.get(toBalanceRef);
      const currentTo = toDoc.exists ? toDoc.data()?.amount || 0 : 0;

      t.set(fromBalanceRef, { amount: currentFrom - parseFloat(amount) }, { merge: true });
      t.set(toBalanceRef, { amount: currentTo + parseFloat(expectedReceive) }, { merge: true });
    });

    // --- 8. Respuesta exitosa ---
    return NextResponse.json({
      success: true,
      message: `Intercambio en proceso. Enviaste ${amount} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}.`,
      txHash: finalTx.tx?.hash,
      orderId,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
