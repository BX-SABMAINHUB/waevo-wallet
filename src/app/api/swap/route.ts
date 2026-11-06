// src/app/api/swap/route.ts
import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import * as admin from 'firebase-admin';
import { randomUUID } from 'crypto';

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

// --- Configuración de GhostSwap ---
const GHOSTSWAP_API_BASE = 'https://partners-api.ghostswap.io';
const GHOSTSWAP_PUBLIC_KEY = process.env.GHOSTSWAP_PUBLIC_KEY; // gspk_live_...
const GHOSTSWAP_SECRET = process.env.GHOSTSWAP_SECRET;         // gssk_live_...

/**
 * Realiza una petición a la API de GhostSwap.
 * Si se proporcionan credenciales, añade la cabecera Authorization.
 * El endpoint público /v1/quotes no las necesita, pero /v1/swaps sí.
 */
async function ghostSwapRequest(
  path: string,
  method: 'GET' | 'POST' = 'POST',
  body?: any,
  requiresAuth: boolean = true
) {
  const url = `${GHOSTSWAP_API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (requiresAuth) {
    if (!GHOSTSWAP_PUBLIC_KEY || !GHOSTSWAP_SECRET) {
      throw new Error(
        'Faltan GHOSTSWAP_PUBLIC_KEY y GHOSTSWAP_SECRET en las variables de entorno. ' +
        'Regístrate en https://partners.ghostswap.io/sign-up para obtenerlas.'
      );
    }
    // GhostSwap espera "Bearer publicKey:secret" (sin base64)
    headers['Authorization'] = `Bearer ${GHOSTSWAP_PUBLIC_KEY}:${GHOSTSWAP_SECRET}`;
  }

  const options: RequestInit = { method, headers };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const res = await fetch(url, options);
  const text = await res.text();

  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    console.error(`[GhostSwap] Respuesta no JSON (HTTP ${res.status}):`, text.substring(0, 300));
    throw new Error(`GhostSwap devolvió una respuesta inesperada (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    throw new Error(json.message || json.error || `Error ${res.status} en GhostSwap`);
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

    // --- 3. Cotización pública (SIN autenticación) ---
    // El endpoint /v1/quotes es público y devuelve amountTo, min y max.
    const quotePayload = {
      from: upperFrom.toLowerCase(),
      to: upperTo.toLowerCase(),
      amountFrom: parseFloat(amount).toString(),
    };

    console.log(`[GhostSwap] Solicitando cotización pública...`);
    const quote = await ghostSwapRequest('/v1/quotes', 'POST', quotePayload, false);

    // La respuesta incluye: amountTo, rate, amountUserReceives, networkFee, min, max
    const minAmount = parseFloat(quote.min || '0');
    const maxAmount = parseFloat(quote.max || '0');

    if (minAmount > 0 && parseFloat(amount) < minAmount) {
      return NextResponse.json({
        error: `El monto mínimo para este par es ${minAmount} ${upperFrom}.`
      }, { status: 400 });
    }
    if (maxAmount > 0 && parseFloat(amount) > maxAmount) {
      return NextResponse.json({
        error: `El monto máximo para este par es ${maxAmount} ${upperFrom}.`
      }, { status: 400 });
    }

    const expectedReceive = parseFloat(quote.amountTo || quote.amountUserReceives || '0');
    if (!expectedReceive) {
      throw new Error('GhostSwap no devolvió una cantidad estimada a recibir.');
    }

    // --- 4. Crear el swap (REQUIERE autenticación) ---
    // Endpoint: POST /v1/swaps. Requiere cabecera Idempotency-Key (UUID v4).
    const idempotencyKey = randomUUID();

    const swapPayload = {
      from: upperFrom.toLowerCase(),
      to: upperTo.toLowerCase(),
      amountFrom: parseFloat(amount).toString(),
      payoutAddress: toAddress, // Dirección de destino de los fondos
      // refundAddress: fromWallet.address, // Opcional para float, recomendado
    };

    console.log(`[GhostSwap] Creando swap con Idempotency-Key: ${idempotencyKey}`);
    const swapData = await ghostSwapRequest('/v1/swaps', 'POST', swapPayload, true, idempotencyKey);

    // La respuesta de /v1/swaps incluye payinAddress (dirección de depósito) e id
    const depositAddress = swapData.payinAddress;
    const orderId = swapData.id;

    if (!depositAddress) {
      throw new Error('GhostSwap no devolvió una dirección de depósito válida (payinAddress).');
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
      throw new Error(`Error al enviar a GhostSwap: ${errDetail}`);
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
      message: `Intercambio en proceso. Enviaste ${amount} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}.`,
      txHash: finalTx.tx?.hash,
      orderId: orderId,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap con GhostSwap]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
