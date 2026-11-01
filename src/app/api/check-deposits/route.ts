import { NextResponse } from 'next/server';

// ============================================================================
// MAPEOS Y CONFIGURACIÓN
// ============================================================================
const BLOCKCHAIR_CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin',
  LTC: 'litecoin',
  DOGE: 'dogecoin',
  BCH: 'bitcoin-cash',
};

// Chain IDs para Blockscout (EVM)
const BLOCKSCOUT_CHAIN_MAP: Record<string, number> = {
  ETH: 1,       // Ethereum Mainnet
  MATIC: 137,   // Polygon
  BNB: 56,      // BSC
  AVAX: 43114,  // Avalanche
  BASE: 8453,   // Base
};

// Caché para Blockchair (evita el error 430)
const cache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 segundos

// ============================================================================
// FUNCIÓN PARA CONSULTAR BLOCKSCOUT (Redes EVM)
// ============================================================================
async function fetchBlockscout(address: string, symbol: string, chainId: number, apiKey: string) {
  const url = `https://api.blockscout.com/v2/api?chain_id=${chainId}&module=account&action=txlist&address=${address}&page=1&offset=50&sort=desc&apikey=${apiKey}`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);
  
  const data = await res.json();
  // Blockscout devuelve status "0" si no hay transacciones
  if (data.status === '0' && data.message === 'No transactions found') {
    return { deposits: [], balance: '0' };
  }
  
  if (data.status !== '1' || !data.result) {
    throw new Error(`Blockscout respondió con un formato inesperado`);
  }

  const deposits = [];
  const decimals = 18; // EVM usa 18 decimales (wei)

  for (const tx of data.result) {
    // Solo ingresos (la dirección está en 'to')
    if (tx.to.toLowerCase() !== address.toLowerCase()) continue;
    
    const value = parseFloat(tx.value) / Math.pow(10, decimals);
    if (value <= 0) continue;

    // Blockscout no da el número exacto de confirmaciones en este endpoint,
    // pero si tiene blockNumber, asumimos al menos 1.
    const confirmations = tx.blockNumber ? 1 : 0; 

    deposits.push({
      symbol: symbol.toUpperCase(),
      amount: value.toFixed(8),
      hash: tx.hash,
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations: confirmations,
      timestamp: parseInt(tx.timeStamp) * 1000,
    });
  }

  // Nota: Blockscout en este endpoint no devuelve el saldo total. 
  // Para simplificar, calculamos el saldo sumando los depósitos confirmados.
  const confirmedBalance = deposits
    .filter(d => d.status === 'confirmed')
    .reduce((sum, d) => sum + parseFloat(d.amount), 0);

  return { deposits, balance: confirmedBalance.toFixed(8) };
}

// ============================================================================
// FUNCIÓN PARA CONSULTAR BLOCKCHAIR (Redes UTXO como LTC, BTC)
// ============================================================================
async function fetchBlockchair(address: string, symbol: string, chain: string) {
  const cacheKey = `${chain}-${address}`;
  const cached = cache.get(cacheKey);

  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return cached.data;
  }

  const url = new URL(`https://api.blockchair.com/${chain}/dashboards/address/${address}`);
  url.searchParams.append('transaction_details', 'true');
  url.searchParams.append('limit', '50');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10000) });
  
  if (res.status === 430) {
    throw new Error('Límite de peticiones a Blockchair excedido. Espera un minuto.');
  }
  if (!res.ok) throw new Error(`Blockchair error: ${res.status}`);

  const json = await res.json();
  const addressData = json.data?.[address];

  if (!addressData) {
    const emptyResult = { deposits: [], balance: '0' };
    cache.set(cacheKey, { data: emptyResult, timestamp: Date.now() });
    return emptyResult;
  }

  const currentBlockHeight = json.context?.state;
  const balanceRaw = addressData.address?.balance || '0';
  const decimals = 8; // UTXO usa 8 decimales
  const balance = (parseFloat(balanceRaw) / Math.pow(10, decimals)).toFixed(8);

  const deposits = [];
  for (const tx of addressData.transactions || []) {
    const change = parseFloat(tx.balance_change || '0');
    if (change <= 0) continue;

    const blockId = tx.block_id;
    const confirmations = blockId > 0 ? currentBlockHeight - blockId + 1 : 0;

    deposits.push({
      symbol: symbol.toUpperCase(),
      amount: (change / Math.pow(10, decimals)).toFixed(8),
      hash: tx.hash,
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations,
      timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
    });
  }

  const result = { deposits, balance };
  cache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
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
    const blockscoutChainId = BLOCKSCOUT_CHAIN_MAP[upperSymbol];
    const blockchairChain = BLOCKCHAIR_CHAIN_MAP[upperSymbol];

    let result;

    // 1. Si es una red EVM (Blockscout)
    if (blockscoutChainId && process.env.BLOCKSCOUT_API_KEY) {
      console.log(`[API] Usando Blockscout para ${upperSymbol}...`);
      result = await fetchBlockscout(address, upperSymbol, blockscoutChainId, process.env.BLOCKSCOUT_API_KEY);
    } 
    // 2. Si es una red UTXO (Blockchair)
    else if (blockchairChain) {
      console.log(`[API] Usando Blockchair para ${upperSymbol}...`);
      result = await fetchBlockchair(address, upperSymbol, blockchairChain);
    } 
    // 3. Si no está soportada
    else {
      return NextResponse.json({ error: `Red no soportada: ${upperSymbol}` }, { status: 400 });
    }

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('🔥 [Error en check-deposits]:', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
