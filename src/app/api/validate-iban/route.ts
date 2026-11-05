import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { iban } = await request.json();
    const cleanIban = iban?.replace(/\s+/g, '').toUpperCase();

    if (!cleanIban || cleanIban.length < 15) {
      return NextResponse.json({ valid: false, bankName: null, error: 'IBAN demasiado corto' });
    }

    // Llamada a Strale sin API Key
    const res = await fetch('https://api.strale.io/v1/do', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task: 'iban-validate', iban: cleanIban }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('❌ Error de Strale:', data);
      return NextResponse.json({ valid: false, bankName: null, error: 'Error en el servicio de validación' }, { status: res.status });
    }

    // La respuesta de Strale puede variar; busca el nombre del banco en 'bank_name' o 'bankName'
    const bankName = data.bank_name || data.bankName || null;

    if (data.valid) {
      return NextResponse.json({ valid: true, bankName: bankName || "Banco no identificado" });
    }

    return NextResponse.json({ valid: false, bankName: null, error: 'IBAN no válido' });

  } catch (error: any) {
    console.error('🔥 [Error en validate-iban]:', error);
    return NextResponse.json({ valid: false, bankName: null, error: error.message }, { status: 500 });
  }
}
