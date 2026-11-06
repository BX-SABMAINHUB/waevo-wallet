// src/app/api/swap/route.ts
import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import ecc from '@bitcoinerlab/secp256k1';
import { ECPairFactory } from 'ecpair';
import * as admin from 'firebase-admin';
import { Hypermid } from '@hypermid/sdk';

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

// --- Cliente anónimo de Hypermid (sin API Key) ---
const hm = new Hypermid();

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

    // --- 3. Obtener los IDs de cadena de Hypermid dinámicamente ---
    const chainsResponse: any = await hm.getChains();
    const chainsList = Array.isArray(chainsResponse) ? chainsResponse : (chainsResponse.chains || []);

    if (!Array.isArray(chainsList)) {
      throw new Error('Hypermid devolvió un formato de cadenas inesperado.');
    }

    const fromChainInfo: any = chainsList.find((c: any) => {
      const symbol = (c?.native as any)?.symbol || c?.symbol || c?.ticker;
      return symbol && symbol.toUpperCase() === upperFrom;
    });

    const toChainInfo: any = chainsList.find((c: any) => {
      const symbol = (c?.native as any)?.symbol || c?.symbol || c?.ticker;
      return symbol && symbol.toUpperCase() === upperTo;
    });

    if (!fromChainInfo) {
      throw new Error(`Hypermid no soporta la cadena de origen ${upperFrom}.`);
    }
    if (!toChainInfo) {
      throw new Error(`Hypermid no soporta la cadena de destino ${upperTo}.`);
    }

    const fromChainId = fromChainInfo.chainId || fromChainInfo.id;
    const toChainId = toChainInfo.chainId || toChainInfo.id;

    // --- 4. Convertir la cantidad a unidades base (satoshis para BTC/LTC) ---
    const nativeInfo = fromChainInfo.native as any;
    const decimals = nativeInfo?.decimals || 8;
    const amountInBaseUnits = BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals))).toString();

    const fromTokenAddress = "native";
    const toTokenAddress = "native";

    // --- 5. Obtener cotización de Hypermid ---
    console.log(`[Hypermid] Solicitando cotización para ${upperFrom} -> ${upperTo}...`);
    const quote = await hm.getQuote({
      fromChain: fromChainId,
      toChain: toChainId,
      fromToken: fromTokenAddress,
      toToken: toTokenAddress,
      fromAmount: amountInBaseUnits,
      fromAddress: fromWallet.address,
      toAddress: toAddress,
    });

    if (!quote) {
      throw new Error('Hypermid no devolvió una cotización válida.');
    }

    // ✅ CORRECCIÓN: el tipo SwapQuote de la versión 3.x no declara `id`.
    // Extraemos el identificador mediante un cast seguro a `any`,
    // buscando tanto `id` como `quoteId` para cubrir ambas versiones del SDK.
    const quoteId = (quote as any).id ?? (quote as any).quoteId;

    if (!quoteId) {
      throw new Error('Hypermid no devolvió un identificador de cotización (id/quoteId).');
    }

    // --- 6. Ejecutar el swap en Hypermid ---
    console.log(`[Hypermid] Ejecutando cotización ${quoteId}...`);
    const exec = await hm.execute({ quoteId });

    const depositAddress = exec.depositAddress;
    const expectedReceive = exec.toAmount || (quote as any).toAmount;

    if (!depositAddress) {
      throw new Error('Hypermid no devolvió una dirección de depósito (depositAddress). Es posible que esta ruta requiera una transacción EVM.');
    }

    // --- 7. Construir y firmar la transacción on-chain (envío a la dirección de depósito) ---
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

    // --- 8. Firmar cada hash "tosign" ---
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

    // --- 9. Enviar transacción firmada a BlockCypher ---
    const sendRes = await fetch(`https://api.blockcypher.com/v1/${fromConfig.blockcypher}/main/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    const finalTx = await sendRes.json();
    if (!sendRes.ok) {
      const errDetail = JSON.stringify(finalTx.errors || finalTx);
      throw new Error(`Error al enviar a Hypermid: ${errDetail}`);
    }

    // --- 10. Actualizar saldos en Firestore (transacción atómica) ---
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

    // --- 11. Respuesta exitosa ---
    return NextResponse.json({
      success: true,
      message: `Intercambio iniciado. Enviaste ${amount} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}.`,
      txHash: finalTx.tx?.hash,
      orderId: quoteId,
    });

  } catch (error: any) {
    console.error('🔥 [Error en swap con Hypermid]:', error);
    if (error.message.includes('no soporta')) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
