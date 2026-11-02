import { NextResponse } from 'next/server';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { ECPairFactory } from 'ecpair';

const ECPair = ECPairFactory(ecc);

// Configuración de redes y direcciones
const FEE_EUR = 0.01;
const FEE_ADDRESS = 'LXa3FdaEGGoTTTBeEB1SYKcRYx8rgUcwW7'; // Tu dirección LTC para la comisión

const NETWORKS: Record<string, { baseUrl: string; network: any; coinId: string }> = {
  LTC: {
    baseUrl: 'https://api.blockcypher.com/v1/ltc/main',
    network: bitcoin.networks.litecoin,
    coinId: 'litecoin',
  },
  BTC: {
    baseUrl: 'https://api.blockcypher.com/v1/btc/main',
    network: bitcoin.networks.bitcoin,
    coinId: 'bitcoin',
  },
};

export async function POST(request: Request) {
  try {
    const { symbol, fromAddress, toAddress, amount, privateKey } = await request.json();

    const upperSymbol = symbol?.toUpperCase();
    const config = NETWORKS[upperSymbol];

    if (!config) {
      return NextResponse.json({ error: `Red no soportada: ${upperSymbol}` }, { status: 400 });
    }
    if (!privateKey || !fromAddress || !toAddress || !amount) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios' }, { status: 400 });
    }

    // 1. Calcular la comisión en cripto (0.01€)
    const priceRes = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${config.coinId}&vs_currencies=eur`);
    const priceData = await priceRes.json();
    const priceEur = priceData[config.coinId]?.eur;
    if (!priceEur) throw new Error('No se pudo obtener el precio de la moneda');
    
    const feeCrypto = FEE_EUR / priceEur;
    // Convertir a la unidad mínima (satoshis/litoshis) para BlockCypher
    const decimals = upperSymbol === 'LTC' ? 8 : 8;
    const amountSatoshi = Math.round(parseFloat(amount) * Math.pow(10, decimals));
    const feeSatoshi = Math.round(feeCrypto * Math.pow(10, decimals));

    // 2. Solicitar a BlockCypher la construcción de la transacción
    // Incluimos la dirección de destino y la dirección de comisión.
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

    if (!txRes.ok) {
      const err = await txRes.text();
      throw new Error(`BlockCypher (new): ${txRes.status} - ${err}`);
    }

    const txData = await txRes.json();
    
    // Si BlockCypher detecta un error en la construcción (ej. fondos insuficientes)
    if (txData.errors && txData.errors.length > 0) {
      throw new Error(txData.errors.join(', '));
    }

    // 3. Firmar la transacción localmente
    // BlockCypher devuelve un array 'tosign' con los hashes que debemos firmar.
    const keyPair = ECPair.fromWIF(privateKey, config.network); 
    
    // NOTA: Si tu clave privada está en formato hexadecimal en lugar de WIF, usa:
    // const keyPair = ECPair.fromPrivateKey(Buffer.from(privateKey, 'hex'), { network: config.network });

    txData.pubkeys = [];
    txData.signatures = txData.tosign.map((tosign: string) => {
      // Firmamos el hash y codificamos la firma en formato DER + tipo de sighash (0x01)
      const signature = keyPair.sign(Buffer.from(tosign, 'hex'));
      // bitcoinjs-lib v6+ requiere codificar la firma
      const encoded = bitcoin.script.signature.encode(signature, bitcoin.Transaction.SIGHASH_ALL);
      txData.pubkeys.push(keyPair.publicKey.toString('hex'));
      return encoded.toString('hex').slice(0, -2); // Quitamos el byte de sighash para BlockCypher
    });

    // 4. Enviar la transacción firmada a la red
    const sendRes = await fetch(`${config.baseUrl}/txs/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(txData),
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      throw new Error(`BlockCypher (send): ${sendRes.status} - ${err}`);
    }

    const finalTx = await sendRes.json();

    return NextResponse.json({
      txId: finalTx.tx.hash,
      status: finalTx.tx.confirmations > 0 ? 'confirmed' : 'pending',
      explorerUrl: `https://live.blockcypher.com/${upperSymbol.toLowerCase()}/tx/${finalTx.tx.hash}/`
    });

  } catch (error: any) {
    console.error('🔥 [Error en send-blockcypher]:', error.message);
    return NextResponse.json({ error: error.message || 'Error al enviar la transacción' }, { status: 500 });
  }
}
