import { NextResponse } from 'next/server';

// ============================================================================
// CONFIGURACIÓN DE PROVEEDORES
// ============================================================================

// 1. Tokens de acceso de GetBlock para redes UTXO
const GETBLOCK_TOKENS: Record<string, string> = {
  LTC: '09c0ea9d212d417d8730693824b42b6e',
  BTC: 'c0d8684e55ea4035adf79f4c9b039c0e',
};

// 2. Chain IDs de Blockscout para redes EVM
const BLOCKSCOUT_CHAIN_IDS: Record<string, number> = {
  ETH: 1,
  MATIC: 137,
  BNB: 56,
  AVAX: 43114,
  BASE: 8453,
  OP: 10,
  ARB: 42161,
};

const GETBLOCK_BASE_URL = 'https://shared.eu-central-1.getblock.io';

// ============================================================================
// LÓGICA PARA GETBLOCK (Blockbook REST) - UTXO (LTC, BTC)
// ============================================================================
async function fetchFromGetBlock(address: string, symbol: string, token: string) {
  const baseUrl = `${GETBLOCK_BASE_URL}/${token}`;
  
  // 1. Obtener la altura actual de la blockchain
  const statusUrl = `${baseUrl}/api/status`;
  const statusRes = await fetch(statusUrl, { signal: AbortSignal.timeout(8000) });
  
  let currentBlock = 0;
  if (statusRes.ok) {
    const statusData = await statusRes.json();
    currentBlock = statusData.backend?.blocks || statusData.blockbook?.bestHeight || 0;
  } else {
    console.warn(`[GetBlock] No se pudo obtener el estado de ${symbol}`);
  }

  // 2. Obtener el saldo y las transacciones de la dirección
  const addressUrl = `${baseUrl}/api/v2/address/${address}?details=txs&pageSize=50`;
  const res = await fetch(addressUrl, { signal: AbortSignal.timeout(10000) });

  if (!res.ok) {
    if (res.status === 404) {
      return { deposits: [], balance: '0' };
    }
    throw new Error(`GetBlock respondió con estado ${res.status}`);
  }

  const data = await res.json();

  // 3. Calcular saldo
  const decimals = 8; // UTXO usa 8 decimales
  const balanceRaw = data.balance || '0';
  const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

  // 4. Procesar transacciones
  const transactions = data.transactions || [];
  const deposits = [];

  for (const tx of transactions) {
    let receivedValue = 0;
    if (tx.vout) {
      for (const out of tx.vout) {
        if (out.addresses?.includes(address)) {
          receivedValue += parseFloat(out.value || '0');
        }
      }
    }

    if (receivedValue <= 0) continue;

    const confirmations = tx.confirmations || 0;
    const status = confirmations >= 1 ? 'confirmed' : 'pending';
    const amount = (receivedValue / Math.pow(10, decimals)).toFixed(8);

    deposits.push({
      symbol,
      amount,
      hash: tx.txid,
      status,
      confirmations,
      timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
    });
  }

  deposits.sort((a, b) => b.timestamp - a.timestamp);
  return { deposits, balance };
}

// ============================================================================
// LÓGICA PARA BLOCKSCOUT (EVM: ETH, MATIC, etc.)
// ============================================================================
async function fetchFromBlockscout(address: string, symbol: string, chainId: number) {
  const apiKey = process.env.BLOCKSCOUT_API_KEY;
  if (!apiKey) throw new Error('Falta BLOCKSCOUT_API_KEY en las variables de entorno');

  // 1. Obtener altura del bloque
  const blockUrl = `https://api.blockscout.com/v2/api?chain_id=${chainId}&module=block&action=eth_block_number&apikey=${apiKey}`;
  const blockRes = await fetch(blockUrl, { signal: AbortSignal.timeout(8000) });
  let currentBlock = 0;
  if (blockRes.ok) {
    const blockData = await blockRes.json();
    currentBlock = parseInt(blockData.result, 16) || 0;
  }

  // 2. Obtener transacciones
  const url = `https://api.blockscout.com/v2/api?chain_id=${chainId}&module=account&action=txlist&address=${address}&page=1&offset=50&sort=desc&apikey=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });

  if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);

  const data = await res.json();

  if (data.status === '0' && data.message === 'No transactions found') {
    return { deposits: [], balance: '0' };
  }

  if (data.status !== '1' || !data.result) {
    throw new Error('Blockscout respondió con un formato inesperado');
  }

  const deposits = [];
  const decimals = 18;
  let confirmedBalance = 0;

  for (const tx of data.result) {
    if (tx.to?.toLowerCase() !== address.toLowerCase()) continue;
    
    const value = parseFloat(tx.value) / Math.pow(10, decimals);
    if (value <= 0) continue;

    const txBlock = parseInt(tx.blockNumber) || 0;
    let confirmations = 0;
    if (txBlock > 0 && currentBlock > 0) {
      confirmations = currentBlock - txBlock + 1;
    }

    const status = confirmations >= 1 ? 'confirmed' : 'pending';
    if (status === 'confirmed') confirmedBalance += value;

    deposits.push({
      symbol: symbol.toUpperCase(),
      amount: value.toFixed(8),
      hash: tx.hash,
      status,
      confirmations,
      timestamp: parseInt(tx.timeStamp) * 1000,
    });
  }

  return { deposits, balance: confirmedBalance.toFixed(8) };
}

// ============================================================================
// CONTROLADOR PRINCIPAL
// ============================================================================
export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    
    // Enrutamiento basado en el tipo de red
    if (GETBLOCK_TOKENS[upperSymbol]) {
      // Es una red UTXO gestionada por GetBlock
      const token = GETBLOCK_TOKENS[upperSymbol];
      console.log(`[API] Consultando GetBlock para ${upperSymbol}...`);
      const result = await fetchFromGetBlock(address, upperSymbol, token);
      return NextResponse.json(result);
    } 
    
    if (BLOCKSCOUT_CHAIN_IDS[upperSymbol]) {
      // Es una red EVM gestionada por Blockscout
      const chainId = BLOCKSCOUT_CHAIN_IDS[upperSymbol];
      console.log(`[API] Consultando Blockscout para ${upperSymbol}...`);
      const result = await fetchFromBlockscout(address, upperSymbol, chainId);
      return NextResponse.json(result);
    }

    // Si no está en ninguno de los mapas
    return NextResponse.json({ 
      error: `Red ${upperSymbol} no soportada.` 
    }, { status: 400 });

  } catch (error: any) {
    console.error('🔥 [Error en check-deposits]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
