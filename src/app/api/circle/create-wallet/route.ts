import { NextResponse } from 'next/server';
import { getCircleSDK } from '@/libs/circle-sdk.server';

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();
    const client = getCircleSDK();

    // 1. Crear un Wallet Set (si no tienes uno ya)
    const walletSetResponse = await client.createWalletSet({
      name: `Waevo Wallet Set - ${userId}`,
    });
    const walletSetId = walletSetResponse.data?.walletSet?.id;

    if (!walletSetId) throw new Error('No se pudo crear el Wallet Set');

    // 2. Crear la billetera para el usuario en la red deseada
    const walletResponse = await client.createWallets({
      walletSetId: walletSetId,
      blockchains: ["MATIC-AMOY"], // Cambia a "MATIC" para mainnet
      count: 1,
    });

    const wallet = walletResponse.data?.wallets?.[0];
    
    return NextResponse.json({ 
      address: wallet?.address, 
      walletId: wallet?.id 
    });

  } catch (error: any) {
    console.error('Error creando billetera en Circle:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
