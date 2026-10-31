import { NextResponse } from 'next/server';

// ============================================================================
// TIPOS Y INTERFACES
// ============================================================================
interface TatumUtxoTransaction {
  hash?: string;
  txId?: string;
  timestamp?: number;
  confirmations?: number;
  blockNumber?: number;
  outputs?: { address: string; value: string }[];
  value?: string;
}

interface TatumEvmTransaction {
  hash: string;
  timestamp?: number;
  confirmations?: number;
  blockNumber?: number;
  amount?: string;
  value?: string;
}

interface DepositResponse {
  symbol: string;
  amount: string;
  hash: string;
  status: 'pending' | 'confirmed';
  confirmations: number;
  timestamp: number;
}

// ============================================================================
// CONFIGURACIÓN DE REDES Y PARÁMETROS
// ============================================================================
const CHAIN_MAP: Record<string, string> = {
  BTC: 'bitcoin-mainnet',
  LTC: 'litecoin-mainnet',
  DOGE: 'doge-mainnet',
  BCH: 'bitcoin-cash-mainnet',
  ETH: 'ethereum',
  MATIC: 'polygon',
  BSC: 'bsc',
  SOL: 'solana',
  ADA: 'cardano-mainnet',
};

const UTXO_CHAINS = ['bitcoin-mainnet', 'litecoin-mainnet', 'doge-mainnet', 'bitcoin-cash-mainnet', 'cardano-mainnet'];

// Tiempo máximo de espera por petición a Tatum (8 segundos)
const FETCH_TIMEOUT_MS = 8000; 

// ============================================================================
// FUNCIONES AUXILIARES
// ============================================================================

/**
 * Formatea el valor numérico devuelto por Tatum a la unidad correcta de la moneda.
 */
function formatValue(value: string | number | undefined, chain: string): string {
  if (!value) return '0';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '0';

  try {
    if (UTXO_CHAINS.includes(chain)) {
      // 8 decimales (satoshis, litoshis, etc.)
      return (num / 1e8).toFixed(8);
    }
    if (['ethereum', 'polygon', 'bsc'].includes(chain)) {
      // 18 decimales (wei)
      return (num / 1e18).toFixed(6);
    }
    if (chain === 'solana') {
      // 9 decimales (lamports)
      return (num / 1e9).toFixed(6);
    }
    if (chain === 'cardano-mainnet') {
      // 6 decimales
      return (num / 1e6).toFixed(6);
    }
  } catch (e) {
    console.error('Error formateando valor:', e);
  }

  return num.toString();
}

/**
 * Wrapper para hacer fetch con un timeout. Evita que Vercel se quede colgado.
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (error) {
    clearTimeout(id);
    throw error;
  }
}

/**
 * Consulta el número real de confirmaciones de una transacción.
 * Hace una llamada al endpoint de detalles si el historial no las proporciona.
 */
async function getRealConfirmations(hash: string, chain: string, fallbackConfirmations: number): Promise<number> {
  // Si ya tiene confirmaciones, las devolvemos directamente
  if (fallbackConfirmations > 0) return fallbackConfirmations;

  try {
    // Endpoint unificado de Tatum v4 para detalles de transacción
    const url = `https://api.tatum.io/v4/data/blockchains/transaction/${hash}?chain=${chain}`;
    const res = await fetchWithTimeout(url, {
      headers: { 'x-api-key': process.env.TATUM_API_KEY! },
    });

    // Si Tatum nos bloquea por rate limit (429), devolvemos lo que teníamos
    if (res.status === 429) {
      console.warn(`[Tatum] Rate limit alcanzado al consultar ${hash}. Devolviendo fallback.`);
      return fallbackConfirmations;
    }

    if (res.ok) {
      const data = await res.json();
      // Tatum puede devolver 'confirmations' o calcularlo a partir de 'blockNumber'
      if (typeof data.confirmations === 'number') {
        return data.confirmations;
      }
      // Fallback si viene blockNumber (aunque no es exacto sin el height actual)
      if (typeof data.blockNumber === 'number' && data.blockNumber > 0) {
        return 1; // Asumimos al menos 1 si está minada
      }
    }
  } catch (error) {
    console.warn(`[Tatum] Error consultando detalles de ${hash}:`, error);
  }

  return fallbackConfirmations;
}

// ============================================================================
// CONTROLADOR PRINCIPAL (POST)
// ============================================================================
export async function POST(request: Request) {
  const startTime = Date.now();
  console.log('--- [API CHECK-DEPOSITS] Iniciando verificación ---');

  try {
    // 1. Validación de entrada
    const body = await request.json();
    const { symbol, address } = body;

    if (!symbol || !address) {
      console.error('❌ [Validación] Faltan símbolo o dirección.');
      return NextResponse.json({ error: 'Faltan símbolo o dirección' }, { status: 400 });
    }

    const upperSymbol = symbol.toUpperCase();
    const chain = CHAIN_MAP[upperSymbol] || 'ethereum';
    
    console.log(`🔍 [Config] Buscando en red: ${chain} para ${upperSymbol} en ${address}`);

    let rawTransactions: any[] = [];

    // 2. Obtener el historial de transacciones (UTXO vs EVM)
    if (UTXO_CHAINS.includes(chain)) {
      console.log(`📡 [Tatum] Consultando historial UTXO para ${chain}...`);
      const url = new URL('https://api.tatum.io/v4/data/blockchains/transaction/history/utxos');
      url.searchParams.append('chain', chain);
      url.searchParams.append('address', address);
      url.searchParams.append('pageSize', '20'); // Límite para no saturar
      url.searchParams.append('txType', 'incoming');

      const res = await fetchWithTimeout(url.toString(), {
        headers: { 'x-api-key': process.env.TATUM_API_KEY! },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ [Tatum UTXO] Error ${res.status}: ${errText}`);
        throw new Error(`Error en Tatum UTXO: ${res.status}`);
      }
      
      const data = await res.json();
      rawTransactions = Array.isArray(data) ? data : data.data || [];
    } else {
      console.log(`📡 [Tatum] Consultando historial EVM para ${chain}...`);
      const url = new URL('https://api.tatum.io/v4/data/transactions');
      url.searchParams.append('chain', chain);
      url.searchParams.append('addresses', address);
      url.searchParams.append('transactionSubtype', 'incoming');

      const res = await fetchWithTimeout(url.toString(), {
        headers: { 'x-api-key': process.env.TATUM_API_KEY! },
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`❌ [Tatum EVM] Error ${res.status}: ${errText}`);
        throw new Error(`Error en Tatum EVM: ${res.status}`);
      }

      const data = await res.json();
      rawTransactions = data.data || [];
    }

    console.log(`✅ [Tatum] Se encontraron ${rawTransactions.length} transacciones brutas.`);

    // 3. Procesar transacciones y obtener confirmaciones reales
    const deposits: DepositResponse[] = [];
    
    // Usamos un bucle for para poder hacer pausas (throttling) y no saturar Tatum
    for (let i = 0; i < rawTransactions.length; i++) {
      const tx = rawTransactions[i];
      const hash = tx.hash || tx.txId;
      
      if (!hash) continue; // Si no hay hash, no podemos hacer nada

      // Obtener confirmaciones iniciales (puede que vengan en 0)
      let initialConfirmations = tx.confirmations || 0;
      
      // Consultar la confirmación real (con protección de rate limit)
      const realConfirmations = await getRealConfirmations(hash, chain, initialConfirmations);

      // Consideramos confirmado si tiene al menos 1 confirmación
      const status = realConfirmations >= 1 ? 'confirmed' : 'pending';

      // Calcular el valor recibido en esta dirección específica
      let totalValue = 0;
      if (tx.outputs && Array.isArray(tx.outputs)) {
        // Para UTXO, sumamos solo los outputs que van a nuestra dirección
        tx.outputs.forEach((out: any) => {
          if (out.address === address) {
            totalValue += parseFloat(out.value || 0);
          }
        });
      } else {
        // Para EVM, el valor viene directo
        totalValue = parseFloat(tx.value || tx.amount || 0);
      }

      deposits.push({
        symbol: upperSymbol,
        amount: formatValue(totalValue, chain),
        hash,
        status,
        confirmations: realConfirmations,
        timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
      });

      // PAUSA DE SEGURIDAD: Tatum permite 3 peticiones por segundo.
      // Esperamos 300ms entre transacciones para no superar el límite.
      if (i < rawTransactions.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }

    const duration = Date.now() - startTime;
    console.log(`🏁 [API CHECK-DEPOSITS] Verificación completada en ${duration}ms. Devolviendo ${deposits.length} depósitos.`);

    // 4. Devolver resultado exitoso
    return NextResponse.json({ deposits });

  } catch (error: any) {
    console.error('🔥 [Error Crítico] en check-deposits:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno verificando depósitos' }, 
      { status: 500 }
    );
  }
}
