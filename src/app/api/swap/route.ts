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

    // --- 3. Import dinámico de Hypermid ---
    const hypermidModule = await import('@hypermid/sdk');
    const { Hypermid, quoteSwap } = hypermidModule;

    const hm = new Hypermid();
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

    // --- 4. Convertir la cantidad a unidades base ---
    const nativeInfo = fromChainInfo.native as any;
    const decimals = nativeInfo?.decimals || 8;
    const amountInBaseUnits = BigInt(Math.round(parseFloat(amount) * Math.pow(10, decimals))).toString();

    // --- 5. Construir el SwapQuoteRequest ---
    // Usamos los Asset IDs de NEAR Intents (nep141:...) para evitar errores de enrutamiento.
    const swapRequest = {
      srcChain: fromChainId,
      dstChain: toChainId,
      tokenIn: 'nep141:ltc.omft.near',   // Asset ID de LTC en NEAR Intents
      tokenOut: 'nep141:btc.omft.near',  // Asset ID de BTC en NEAR Intents
      amountIn: amountInBaseUnits,
      recipient: toAddress,
      srcAddress: fromWallet.address,    // Dirección de origen para reembolsos
    };

    console.log(`[Hypermid] Solicitando cotización con quoteSwap...`);
    const quote = await quoteSwap(swapRequest);

    if (!quote) {
      throw new Error('Hypermid no devolvió una cotización válida.');
    }

    // --- 6. Manejar el resultado discriminado de quoteSwap ---
    const execute = quote.execute;

    if (execute.kind === 'deposit') {
      const depositAddress = execute.address;
      const amountToSend = execute.amount || amountInBaseUnits;
      const expectedReceive = quote.estimatedOut;

      console.log(`[Hypermid] Ruta de depósito. Enviar ${amountToSend} ${upperFrom} a ${depositAddress}`);

      // --- 7. Construir y firmar la transacción on-chain (envío a la dirección de depósito) ---
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
        if (currentFrom < parseFloat(amountToSend)) {
          throw new Error('Saldo insuficiente');
        }

        const toDoc = await t.get(toBalanceRef);
        const currentTo = toDoc.exists ? toDoc.data()?.amount || 0 : 0;

        t.set(fromBalanceRef, { amount: currentFrom - parseFloat(amountToSend) }, { merge: true });
        t.set(toBalanceRef, { amount: currentTo + parseFloat(expectedReceive) }, { merge: true });
      });

      return NextResponse.json({
        success: true,
        message: `Intercambio iniciado. Enviaste ${amountToSend} ${upperFrom} y recibirás ≈ ${expectedReceive} ${upperTo}.`,
        txHash: finalTx.tx?.hash,
        orderId: depositAddress,
      });

    } else if (execute.kind === 'transaction') {
      throw new Error('Esta ruta requiere firma de transacción EVM, no soportada para BTC/LTC en este endpoint.');
    } else {
      throw new Error('Tipo de ejecución desconocido en la cotización de Hypermid.');
    }

  } catch (error: any) {
    // 🔥 MANEJO ROBUSTO DE ERRORES para evitar "[object Object]"
    console.error('🔥 [Error en swap con Hypermid]:', error);
    
    let errorMessage = 'Error interno en el intercambio';

    if (typeof error === 'string') {
      errorMessage = error;
    } else if (error instanceof Error) {
      errorMessage = error.message || error.toString();
    } else if (typeof error === 'object' && error !== null) {
      // Si el SDK o la API devuelven un objeto de error, intentamos extraer la info útil
      errorMessage = error.message || error.error || error.detail || error.reason || JSON.stringify(error);
    }

    // Nos aseguramos de que el mensaje final sea siempre un string
    if (typeof errorMessage !== 'string') {
      errorMessage = JSON.stringify(errorMessage);
    }

    if (errorMessage.includes('no soporta')) {
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
