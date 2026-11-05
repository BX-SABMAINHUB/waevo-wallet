import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { iban } = await request.json();
    const cleanIban = iban?.replace(/\s+/g, '').toUpperCase();

    if (!cleanIban || cleanIban.length < 15) {
      return NextResponse.json({ valid: false, bankName: null });
    }

    // La clave se lee de las variables de entorno del servidor (privada)
    const apiKey = process.env.IBANFORGE_API_KEY;

    const res = await fetch('https://api.ibanforge.com/v1/iban/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({ iban: cleanIban }),
    });

    const data = await res.json();

    if (data.valid && data.bankName) {
      return NextResponse.json({ valid: true, bankName: data.bankName });
    } else if (data.valid) {
      return NextResponse.json({ valid: true, bankName: "Banco no identificado" });
    } else {
      return NextResponse.json({ valid: false, bankName: null });
    }
  } catch (error) {
    console.error('Error validando IBAN en el servidor:', error);
    return NextResponse.json({ valid: false, bankName: null }, { status: 500 });
  }
}
