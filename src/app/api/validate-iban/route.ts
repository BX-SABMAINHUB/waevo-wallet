import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { iban } = await request.json();
    const cleanIban = iban?.replace(/\s+/g, '').toUpperCase();

    if (!cleanIban || cleanIban.length < 15) {
      return NextResponse.json({ valid: false, bankName: null, error: 'IBAN demasiado corto' });
    }

    // Llamada a Strale (gratuita y sin API Key)
    const res = await fetch('https://api.strale.io/v1/do', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        capability_slug: 'iban-validate',
        inputs: { iban: cleanIban },
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error('❌ Error de Strale:', res.status, errorData);
      return NextResponse.json({ valid: false, bankName: null, error: 'Error en el servicio de validación' }, { status: res.status });
    }

    const data = await res.json();

    // Strale devuelve los datos dentro de la propiedad 'output'
    const output = data.output;

    if (output && output.valid) {
      // Si el IBAN es válido pero no se identifica el banco, lo indicamos
      const bankName = output.bank_name || 'Banco no identificado';
      return NextResponse.json({ valid: true, bankName: bankName });
    }

    return NextResponse.json({ valid: false, bankName: null, error: 'IBAN no válido según Strale' });

  } catch (error: any) {
    console.error('🔥 [Error en validate-iban]:', error);
    return NextResponse.json({ valid: false, bankName: null, error: error.message }, { status: 500 });
  }
}
