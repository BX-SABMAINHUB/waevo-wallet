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

// --- Configuración de Exolix ---
const EXOLIX_API_KEY = process.env.EXOLIX_API_KEY!;
const EXOLIX_BASE_URL = 'https://exolix.com/api/v2';

/**
 * Realiza una petición a la API de Exolix.
 * La autenticación se realiza mediante la cabecera 'Authorization'.
 */
async function exolixRequest(path: string, method: 'GET' | 'POST' = 'GET', body?: any) {
  const url = `${EXOLIX_BASE_URL}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': EXOLIX_API_KEY, // Cabecera de autenticación de Exolix
    },
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
    console.error(`[Exolix] Respuesta no JSON (HTTP ${res.status}):`, text.substring(0, 300));
    throw new Error(`Exolix devolvió una respuesta inesperada (HTTP ${res.status}).`);
  }

  if (!res.ok) {
    // Exolix devuelve un campo 'message' con el error detallado
    throw new Error(json.message || `Error ${res.status} en Exolix`);
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

    // --- 3. (Recomendado) Consultar la tasa y el mínimo en Exolix ---
    // Endpoint: GET /rate?coinFrom=btc&networkFrom=btc&coinTo=eth&networkTo=eth&amount=0.01
    const ratePath = `/rate?coinFrom=${upperFrom.toLowerCase()}&networkFrom=${upperFrom.toLowerCase()}&coinTo=${upperTo.toLowerCase()}&networkTo=${upperTo.toLowerCase()}&amount=${amount}`;
    let rateData: any = null;
    try {
      rateData = await exolixRequest(ratePath);
      const minAmount = rateData.minAmount;
      if (minAmount && parseFloat(amount) < parseFloat(minAmount)) {
        return NextResponse.json({
          error: `El monto mínimo para este par es ${minAmount} ${upperFrom}.`
        }, { status: 400 });
      }
    } catch (rateError: any) {
      // Si falla la consulta de tasa, no bloqueamos la creación de la orden; solo lo registramos.
      console.warn(`[Exolix] No se pudo verificar la tasa/mínimo:`, rateError.message);
    }

    // --- 4. Crear la orden de intercambio en Exolix ---
    // Endpoint: POST /transactions
    const orderPayload = {
      coinFrom: upperFrom.toLowerCase(),
      networkFrom: upperFrom.toLowerCase(), // Asumimos que la red coincide con el símbolo
      coinTo: upperTo.toLowerCase(),
      networkTo: upperTo.toLowerCase(),
      amount: parseFloat(amount),
      withdrawalAddress: toAddress,
      rateType: 'float', // 'float' (flotante) o 'fixed' (fija)
    };

    const orderData = await exolixRequest('/transactions', 'POST', orderPayload);

    // --- 5. Extraer los datos de la respuesta de Exolix ---
    // Según la documentación, la respuesta contiene:
    // - depositAddress (dirección donde enviar los fondos)
    // - amountTo (cantidad estimada a recibir)
    // - id (ID de la transacción)
    const depositAddress = orderData.depositAddress;
    const expectedReceive = orderData.amountTo;
    const orderId = orderData.id;

    if (!depositAddress) {
      throw new Error('Exolix no devolvió una dirección de depósito válida.');
    }

    // --- 6. Construir y firmar la transacción on-chain (envío a la dirección de depósito) ---
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

    // --- 7. Firmar cada hash "tosign" ---
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

    // --- 8. Enviar transacción firmada a BlockCypher ---
    const sendRes = await fetch(`https://api.blockcypher.com/v1/${fromConfig.blockcypher}/main/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    const finalTx = await sendRes.json();
    if (!sendRes.ok) {
      const errDetail = JSON.stringify(finalTx.errors || finalTx);
      throw new Error(`Error al enviar a Exolix: ${errDetail}`);
    }

    // --- 9. Actualizar saldos en Firestore (transacción atómica) ---
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

    // --- 10. Respuesta exitosa ---
    return NextResponse.json({
      success: true,
      message: `Intercambio en proceso. Enviaste ${amount} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}.`,
      txHash: finalTx.tx?.hash,
      orderId: orderId,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap con Exolix]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
