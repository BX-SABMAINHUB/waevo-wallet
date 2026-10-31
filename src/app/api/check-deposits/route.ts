import { NextResponse } from 'next/server';

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================
interface Deposit {
  symbol: string;
  amount: string;
  hash: string;
  status: 'pending' | 'confirmed';
  confirmations: number;
  timestamp: number;
}

type ProviderFunction = (address: string, symbol: string) => Promise<Deposit[] | null>;

// ============================================================================
// 1. BLOCKCHAIR (Keyless, ~30 req/min)
// ============================================================================
async function fetchBlockchair(address: string, symbol: string): Promise<Deposit[] | null> {
  const chain = symbol.toUpperCase() === 'LTC' ? 'litecoin' : 'bitcoin';
  const url = `https://api.blockchair.com/${chain}/dashboards/address/${address}?transaction_details=true&limit=20`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Blockchair error: ${res.status}`);
  
  const data = await res.json();
  const addressData = data.data?.[address];
  if (!addressData) return [];

  const currentBlock = data.context?.state;
  if (typeof currentBlock !== 'number') throw new Error('Blockchair: invalid block height');

  const decimals = 8;
  const deposits: Deposit[] = [];
  const txs = addressData.transactions || [];

  for (const tx of txs) {
    const change = parseFloat(tx.balance_change || '0');
    if (change <= 0) continue; // Solo ingresos

    const blockId = tx.block_id;
    const confirmations = blockId > 0 ? currentBlock - blockId + 1 : 0;
    
    deposits.push({
      symbol,
      amount: (change / Math.pow(10, decimals)).toFixed(8),
      hash: tx.hash,
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations,
      timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
    });
  }
  return deposits;
}

// ============================================================================
// 2. SOCHAIN (Keyless para LTC)
// ============================================================================
async function fetchSoChain(address: string, symbol: string): Promise<Deposit[] | null> {
  const net = symbol.toUpperCase();
  const url = `https://sochain.com/api/v3/transactions/${net}/${address}`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`SoChain error: ${res.status}`);
  
  const json = await res.json();
  if (json.status !== 'success' || !Array.isArray(json.data)) return [];

  const deposits: Deposit[] = [];
  const decimals = 8;

  for (const tx of json.data) {
    // SoChain v3 a veces devuelve el valor en 'value' o en 'outputs'
    let received = 0;
    if (tx.outputs && Array.isArray(tx.outputs)) {
        tx.outputs.forEach((out: any) => { if (out.address === address) received += parseFloat(out.value || 0); });
    } else {
        received = parseFloat(tx.value || tx.amount || 0);
    }
    
    if (received <= 0) continue;

    // SoChain calcula las confirmaciones directamente en transaction_status
    const confirmations = tx.transaction_status?.confirmations || 0;

    deposits.push({
      symbol,
      amount: (received / Math.pow(10, decimals)).toFixed(8),
      hash: tx.txid || tx.hash,
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations,
      timestamp: tx.time ? new Date(tx.time).getTime() : Date.now(),
    });
  }
  return deposits;
}

// ============================================================================
// 3. BLOCKCYPHER (Free tier con límites)
// ============================================================================
async function fetchBlockCypher(address: string, symbol: string): Promise<Deposit[] | null> {
  const net = symbol.toUpperCase() === 'LTC' ? 'ltc' : 'btc';
  const url = `https://api.blockcypher.com/v1/${net}/main/addrs/${address}/full?limit=20`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BlockCypher error: ${res.status}`);
  
  const data = await res.json();
  if (!data.txs) return [];

  const decimals = 8;
  const deposits: Deposit[] = [];

  for (const tx of data.txs) {
    // Buscamos si nuestra dirección está en los outputs
    let received = 0;
    if (tx.outputs) {
        tx.outputs.forEach((out: any) => { if (out.addresses?.includes(address)) received += (out.value || 0); });
    }
    if (received <= 0) continue;

    deposits.push({
      symbol,
      amount: (received / Math.pow(10, decimals)).toFixed(8),
      hash: tx.hash,
      status: tx.confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations: tx.confirmations || 0,
      timestamp: tx.confirmed ? new Date(tx.confirmed).getTime() : Date.now(),
    });
  }
  return deposits;
}

// ============================================================================
// 4. LITECOIN SPACE (API compatible con mempool.space, keyless)
// ============================================================================
async function fetchLitecoinSpace(address: string, symbol: string): Promise<Deposit[] | null> {
  if (symbol.toUpperCase() !== 'LTC') throw new Error('LitecoinSpace solo soporta LTC');
  
  const url = `https://litecoinspace.org/api/address/${address}/txs`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`LitecoinSpace error: ${res.status}`);
  
  const txs = await res.json();
  if (!Array.isArray(txs)) return [];

  const deposits: Deposit[] = [];
  const decimals = 8;

  for (const tx of txs) {
    // Verificar si la dirección recibió fondos (en vout)
    let received = 0;
    if (tx.vout) {
        tx.vout.forEach((out: any) => { if (out.scriptpubkey_address === address) received += (out.value || 0); });
    }
    if (received <= 0) continue;

    // LitecoinSpace devuelve un objeto de estado
    const confirmations = tx.status?.confirmed ? 1 : 0; // Aproximación simple
    // Si quieres el número exacto, deberías consultar el bloque actual, pero para el estado es suficiente.

    deposits.push({
      symbol,
      amount: (received / Math.pow(10, decimals)).toFixed(8),
      hash: tx.txid,
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations: confirmations, // Nota: esta API no da el número exacto fácilmente
      timestamp: tx.status?.block_time ? tx.status.block_time * 1000 : Date.now(),
    });
  }
  return deposits;
}

// ============================================================================
// 5. BLOCKCHAIN.COM (Endpoint legacy para LTC)
// ============================================================================
async function fetchBlockchainCom(address: string, symbol: string): Promise<Deposit[] | null> {
  const net = symbol.toUpperCase() === 'LTC' ? 'ltc' : 'btc';
  const url = `https://blockchain.info/${net}/address/${address}?format=json`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return []; // Dirección sin actividad
  if (!res.ok) throw new Error(`Blockchain.com error: ${res.status}`);
  
  const data = await res.json();
  if (!data.txs) return [];

  // Necesitamos la altura actual para calcular confirmaciones
  const blockRes = await fetch(`https://blockchain.info/${net}/latestblock?format=json`);
  const blockData = await blockRes.json();
  const currentBlock = blockData.height;

  const decimals = 8;
  const deposits: Deposit[] = [];

  for (const tx of data.txs) {
    let received = 0;
    if (tx.out) {
        tx.out.forEach((out: any) => { if (out.addr === address) received += (out.value || 0); });
    }
    if (received <= 0) continue;

    const confirmations = tx.block_height > 0 ? currentBlock - tx.block_height + 1 : 0;

    deposits.push({
      symbol,
      amount: (received / Math.pow(10, decimals)).toFixed(8),
      hash: tx.hash,
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations,
      timestamp: tx.time ? tx.time * 1000 : Date.now(),
    });
  }
  return deposits;
}

// ============================================================================
// 6. BITCORE (API estandarizada de BitPay, keyless)
// ============================================================================
async function fetchBitcore(address: string, symbol: string): Promise<Deposit[] | null> {
  const chain = symbol.toUpperCase() === 'LTC' ? 'LTC' : 'BTC';
  const url = `https://api.bitcore.io/api/${chain}/main/address/${address}/txs`;
  
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Bitcore error: ${res.status}`);
  
  const txs = await res.json();
  if (!Array.isArray(txs)) return [];

  const deposits: Deposit[] = [];
  const decimals = 8;

  for (const tx of txs) {
    // Bitcore devuelve las transacciones con una estructura similar a Bitcoin
    let received = 0;
    if (tx.outputs) {
        tx.outputs.forEach((out: any) => { if (out.address === address) received += (out.value || 0); });
    }
    if (received <= 0) continue;

    // Asumimos que si tiene blockHeight, está minada
    const confirmations = tx.blockHeight > 0 ? 1 : 0; 

    deposits.push({
      symbol,
      amount: (received / Math.pow(10, decimals)).toFixed(8),
      hash: tx.txid,
      status: confirmations >= 1 ? 'confirmed' : 'pending',
      confirmations,
      timestamp: tx.blockTime ? new Date(tx.blockTime).getTime() : Date.now(),
    });
  }
  return deposits;
}

// ============================================================================
// LISTA DE PROVEEDORES EN ORDEN DE PRIORIDAD
// ============================================================================
const PROVIDERS: { name: string; fn: ProviderFunction }[] = [
  { name: 'Blockchair', fn: fetchBlockchair },
  { name: 'SoChain', fn: fetchSoChain },
  { name: 'BlockCypher', fn: fetchBlockCypher },
  { name: 'LitecoinSpace', fn: fetchLitecoinSpace },
  { name: 'Blockchain.com', fn: fetchBlockchainCom },
  { name: 'Bitcore', fn: fetchBitcore },
];

// ============================================================================
// CONTROLADOR PRINCIPAL (FALLBACK SECUENCIAL)
// ============================================================================
export async function POST(request: Request) {
  try {
    const { symbol, address } = await request.json();
    if (!symbol || !address) {
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    console.log(`[CHECK-DEPOSITS] Iniciando verificación para ${symbol} en ${address}...`);

    for (const provider of PROVIDERS) {
      try {
        console.log(`[CHECK-DEPOSITS] Intentando con ${provider.name}...`);
        const deposits = await provider.fn(address, symbol);

        if (deposits !== null) {
          console.log(`✅ [CHECK-DEPOSITS] Éxito con ${provider.name}. Depósitos encontrados: ${deposits.length}`);
          
          // Calculamos el saldo confirmado sumando los depósitos
          const confirmedBalance = deposits
            .filter(d => d.status === 'confirmed')
            .reduce((sum, d) => sum + parseFloat(d.amount), 0);

          return NextResponse.json({
            deposits,
            balance: confirmedBalance.toFixed(8),
            provider: provider.name, // Devolvemos qué API funcionó
          });
        }
      } catch (error: any) {
        console.warn(`⚠️ [CHECK-DEPOSITS] Falló ${provider.name}: ${error.message}`);
        // Continuamos con el siguiente proveedor
      }
    }

    // Si llegamos aquí, todos los proveedores fallaron
    console.error('❌ [CHECK-DEPOSITS] Todos los proveedores fallaron.');
    return NextResponse.json(
      { error: 'No se pudo conectar con ningún explorador de bloques en este momento. Inténtalo de nuevo más tarde.' },
      { status: 502 } // Bad Gateway
    );

  } catch (error: any) {
    console.error('🔥 [CHECK-DEPOSITS] Error crítico:', error.message);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
