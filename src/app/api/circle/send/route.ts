import { NextResponse } from 'next/server';
import { getCircleSDK } from '@/libs/circle-sdk.server';

export async function POST(request: Request) {
  try {
    const { walletId, toAddress, amount, tokenAddress } = await request.json();
    const client = getCircleSDK();

    // Ejecutar la transferencia
    const transactionResponse = await client.createTransaction({
      walletId: walletId,
      destinationAddress: toAddress,
      amounts: [amount.toString()],
      tokenAddress: tokenAddress, // Dirección del contrato del token (ej. USDC)
      feeLevel: 'MEDIUM', // Nivel de comisión
    });

    return NextResponse.json({ 
      transactionId: transactionResponse.data?.id,
      status: transactionResponse.data?.state 
    });

  } catch (error: any) {
    console.error('Error enviando transacción en Circle:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
