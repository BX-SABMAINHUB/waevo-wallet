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

// --- Configuración de LeoDex (LeoKit) ---
const LEOKIT_API_BASE = 'https://api.leokit.dev';
// Clave pública universal de LeoDex (no requiere registro)
const LEOKIT_API_KEY = 'fa57ad8f-880d-4111-86ec-bc32d7e2b4c7';

/**
 * Realiza una petición a la API de LeoKit.
 */
async function leoKitRequest(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const url = `${LEOKIT_API_BASE}${path}`;
  const headers: Record<string, string> = {
    'Api-Key': LEOKIT_API_KEY,
    'Content-Type': 'application/json',
  };

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
    console.error(`[LeoKit] Respuesta no JSON (HTTP ${res.status}):`, text.substring(0, 300));
    throw new Error(`LeoKit devolvió una respuesta inesperada (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    const errorMsg = json.error || json.message || `Error ${res.status} en LeoKit`;
    // Manejo especial para clave inactiva (se puede renovar recargando el archivo de docs)
    if (res.status === 403 && json.code === 'KEY_INACTIVE') {
      throw new Error('La clave pública de LeoDex ha caducado. Visita https://leodex.io/swap-api.md para obtener la nueva clave y actualizarla en el código.');
    }
    throw new Error(errorMsg);
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

    // --- 3. Obtener cotización de LeoDex ---
    // LeoDex usa IDs de activo con formato CHAIN.TICKER (ej. BTC.BTC, ETH.ETH)
    const fromAsset = `${upperFrom}.${upperFrom}`;
    const toAsset = `${upperTo}.${upperTo}`;

    // Convertir cantidad a string decimal (LeoDex usa strings, no unidades base)
    const amountStr = parseFloat(amount).toString();

    const quotePath = `/quote-deposit?from_asset=${fromAsset}&to_asset=${toAsset}&amount=${amountStr}&slippage_bps=300`;
    console.log(`[LeoDex] Solicitando cotización: ${quotePath}`);
    const quoteData = await leoKitRequest(quotePath, 'GET');

    // Extraer la mejor cotización (la que tiene smart_recommended: true)
    const quotes = quoteData.quotes || [];
    const bestQuote = quotes.find((q: any) => q.smart_recommended === true) || quotes[0];

    if (!bestQuote) {
      throw new Error('LeoDex no devolvió ninguna cotización para este par.');
    }

    const quoteId = quoteData.quote_id;
    const expectedAmountOut = bestQuote.data?.expected_amount_out;
    const outAssetDecimal = bestQuote.data?.out_asset_decimal || 8;

    if (!quoteId) {
      throw new Error('LeoDex no devolvió un ID de cotización válido.');
    }

    // La cantidad esperada a recibir viene en la unidad más pequeña; la convertimos
    const expectedReceive = expectedAmountOut ? parseInt(expectedAmountOut) / Math.pow(10, outAssetDecimal) : 0;

    // --- 4. Obtener dirección de depósito de LeoDex ---
    // Necesitamos la dirección de la wallet de origen para posibles reembolsos
    const depositPayload = {
      quote_id: quoteId,
      from_address: fromWallet.address, // Dirección de reembolso en la cadena de origen
      to_address: toAddress,           // Dirección de recepción en la cadena de destino
    };

    console.log(`[LeoDex] Solicitando dirección de depósito para quote ${quoteId}...`);
    const depositData = await leoKitRequest('/deposit-address', 'POST', depositPayload);

    const depositAddress = depositData.deposit_address;
    const amountToSend = depositData.amount; // La cantidad exacta que se debe enviar
    const expiresAt = depositData.expires_at;

    if (!depositAddress) {
      throw new Error('LeoDex no devolvió una dirección de depósito válida.');
    }

    // --- 5. Construir y firmar la transacción on-chain (envío a la dirección de depósito) ---
    // Usamos la cantidad exacta que indica LeoDex (amountToSend) por si hay variaciones
    const amountSatoshi = Math.round(parseFloat(amountToSend) * 1e8);

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
      throw new Error(`Error al enviar a LeoDex: ${errDetail}`);
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
      message: `Intercambio iniciado. Enviaste ${amount} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}. La transacción está siendo procesada por la red.`,
      txHash: finalTx.tx?.hash,
      orderId: quoteId,
      expiresAt: expiresAt,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap con LeoDex]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
