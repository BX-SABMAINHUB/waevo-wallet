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

// --- Redes soportadas para el envío on-chain (BlockCypher) ---
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

const SWAPTITAN_BASE_URL = 'https://swaptitan.net';

/**
 * Llama a la API de SwapTitan.
 * @param path - Ruta del endpoint (ej. '/v1/swap/quote' o '/v1/swap/swap')
 * @param method - GET o POST
 * @param body - Cuerpo opcional para POST
 */
async function swapTitanRequest(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const url = `${SWAPTITAN_BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : {},
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`[SwapTitan] Respuesta no JSON (HTTP ${res.status}):`, text.substring(0, 300));
    throw new Error(`SwapTitan devolvió una respuesta inesperada (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(json.error || json.message || `Error ${res.status} en SwapTitan`);
  }

  return json;
}

export async function POST(request: Request) {
  try {
    const { userId, fromSymbol, toSymbol, amount } = await request.json();
    const upperFrom = fromSymbol?.toUpperCase();
    const upperTo = toSymbol?.toUpperCase();
    const fromConfig = NETWORKS[upperFrom];

    // --- Validaciones básicas ---
    if (!upperFrom || !upperTo || !userId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Faltan parámetros: fromSymbol, toSymbol, userId y amount son obligatorios.' }, { status: 400 });
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

    // --- 3. Obtener cotización de SwapTitan (cross-chain) ---
    // Según la documentación, el endpoint de cotización cross-chain es:
    // GET /v1/swap/quote?from=btc&to=eth&amount=1
    // (Soporta 1288+ assets, incluyendo BTC y LTC)[reference:2]
    const quotePath = `/v1/swap/quote?from=${upperFrom.toLowerCase()}&to=${upperTo.toLowerCase()}&amount=${amount}`;
    console.log(`[SwapTitan] Solicitando cotización: ${quotePath}`);
    const quote = await swapTitanRequest(quotePath);

    // La respuesta de cotización debe incluir los detalles de la ruta.
    // Asumimos que devuelve un objeto con 'fromAmount', 'toAmount', 'depositAddress', etc.
    // Ajusta estos campos según la respuesta real de SwapTitan.
    const depositAddress = quote.depositAddress || quote.address;
    const expectedReceive = quote.toAmount || quote.receiveAmount;
    const orderId = quote.orderId || quote.id;

    if (!depositAddress) {
      throw new Error('SwapTitan no devolvió una dirección de depósito válida en la cotización.');
    }

    // --- 4. Construir y firmar la transacción on-chain (envío a la dirección de depósito) ---
    // (Esta parte se mantiene igual, usando BlockCypher para enviar los fondos)
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
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
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
      throw new Error(`Error al enviar a SwapTitan: ${errDetail}`);
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
      orderId: orderId,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap con SwapTitan]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
