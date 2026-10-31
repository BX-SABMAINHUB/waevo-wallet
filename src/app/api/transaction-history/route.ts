import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { address } = await request.json();
    if (!address) {
      return NextResponse.json({ error: 'Dirección requerida' }, { status: 400 });
    }

    // Consultamos Ethereum y Polygon (puedes añadir más cadenas)
    const chains = ['ethereum', 'polygon', 'bsc'];
    const history: any[] = [];

    for (const chain of chains) {
      try {
        const res = await fetch(
          `https://api.tatum.io/v4/data/transactions?chain=${chain}&addresses=${address}&transactionSubtype=outgoing`,
          { headers: { 'x-api-key': process.env.TATUM_API_KEY! } }
        );
        if (res.ok) {
          const data = await res.json();
          (data.data || []).forEach((tx: any) => {
            history.push({
              chain,
              hash: tx.hash,
              amount: tx.amount || tx.value || '0',
              to: tx.to,
              timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
              status: tx.confirmations > 0 ? 'confirmed' : 'pending',
            });
          });
        }
      } catch (err) {
        console.error(`Error obteniendo historial en ${chain}:`, err);
      }
    }

    // Ordenar por fecha descendente
    history.sort((a, b) => b.timestamp - a.timestamp);

    return NextResponse.json({ history });
  } catch (error: any) {
    console.error('Error en transaction-history:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
