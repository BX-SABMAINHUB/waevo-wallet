// src/app/api/swap/route.ts
import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import * as admin from 'firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

bitcoin.initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

// --- Inicialización de Firebase Admin ---
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

// --- Configuración de Godex ---
// ✅ URL base correcta (sin /api/v1, que se añade en cada ruta)
const GODEX_API_BASE = 'https://api.godex.io';
const GODEX_PUBLIC_KEY = process.env.GODEX_PUBLIC_KEY || '';

async function godexRequest(path: string, method: 'GET' | 'POST' = 'POST', body?: any) {
  const url = `${GODEX_API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  if (GODEX_PUBLIC_KEY) {
    headers['public-key'] = GODEX_PUBLIC_KEY;
  }

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();

  // Intentar parsear JSON; si falla, lanzar error con el cuerpo HTML
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`[Godex] Respuesta no JSON (HTTP ${res.status}):`, text.substring(0, 300));
    throw new Error(`Godex devolvió una respuesta inesperada (HTTP ${res.status}). Revisa los logs.`);
  }

  if (!res.ok) {
    throw new Error(json.error || json.message || `Error ${res.status} en Godex`);
  }

  return json;
}

export async function POST(request: Request) {
  try {
    const { userId, fromSymbol, toSymbol, amount } = await request.json();
    const upperFrom = fromSymbol?.toUpperCase();
    const upperTo = toSymbol?.toUpperCase();
    const fromConfig = NETWORKS[upperFrom];

    if (!upperFrom || !upperTo || !userId || !amount || amount <= 0) {
      return NextResponse.json({ error: 'Faltan parámetros válidos.' }, { status: 400 });
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

    // --- 3. Obtener cotización (CORREGIDO: sin address ni refund) ---
    const quotePayload = {
      from: upperFrom.toLowerCase(),
      to: upperTo.toLowerCase(),
      amount: parseFloat(amount),
      float: true, // Obligatorio para tasa flotante
      network_from: upperFrom.toUpperCase(), // Para nativos, la red es el ticker
      network_to: upperTo.toUpperCase(),
    };

    console.log(`[Godex] Solicitando cotización con:`, quotePayload);
    const quote = await godexRequest('/api/v1/info', 'POST', quotePayload);

    // La respuesta de /info incluye: amount, rate, min_amount, max_amount, fee
    const minAmount = parseFloat(quote.min_amount || '0');
    const maxAmount = parseFloat(quote.max_amount || '0');

    if (minAmount > 0 && parseFloat(amount) < minAmount) {
      return NextResponse.json({ error: `El monto mínimo para este par es ${minAmount} ${upperFrom}.` }, { status: 400 });
    }
    if (maxAmount > 0 && parseFloat(amount) > maxAmount) {
      return NextResponse.json({ error: `El monto máximo para este par es ${maxAmount} ${upperFrom}.` }, { status: 400 });
    }

    const expectedReceive = parseFloat(quote.amount || '0');
    if (!expectedReceive) {
      throw new Error('Godex no devolvió una cantidad estimada a recibir.');
    }

    // --- 4. Crear el intercambio (endpoint /api/v1/exchange) ---
    // Este endpoint sí requiere address y refund.
    const exchangePayload = {
      from: upperFrom.toLowerCase(),
      to: upperTo.toLowerCase(),
      amount: parseFloat(amount),
      address: toAddress,
      refund: fromWallet.address,
      float: true,
      network_from: upperFrom.toUpperCase(),
      network_to: upperTo.toUpperCase(),
    };

    console.log(`[Godex] Creando orden de intercambio con:`, exchangePayload);
    const exchangeData = await godexRequest('/api/v1/exchange', 'POST', exchangePayload);

    // La respuesta de /exchange debe incluir 'deposit' (dirección de depósito) y 'transaction_id'
    const depositAddress = exchangeData.deposit;
    const orderId = exchangeData.transaction_id;

    if (!depositAddress) {
      throw new Error('Godex no devolvió una dirección de depósito válida.');
    }

    // --- 5. Construir y firmar la transacción on-chain (envío a la dirección de depósito) ---
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

    // --- 6. Firmar cada hash "tosign" ---
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

    // --- 7. Enviar transacción firmada a BlockCypher ---
    const sendRes = await fetch(`https://api.blockcypher.com/v1/${fromConfig.blockcypher}/main/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    const finalTx = await sendRes.json();
    if (!sendRes.ok) {
      const errDetail = JSON.stringify(finalTx.errors || finalTx);
      throw new Error(`Error al enviar a Godex: ${errDetail}`);
    }

    // --- 8. Actualizar saldos en Firestore (transacción atómica) ---
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
      t.set(toBalanceRef, { amount: currentTo + expectedReceive }, { merge: true });
    });

    // --- 9. Respuesta exitosa ---
    return NextResponse.json({
      success: true,
      message: `Intercambio iniciado. Enviaste ${amount} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}.`,
      txHash: finalTx.tx?.hash,
      orderId: orderId,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap con Godex]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
