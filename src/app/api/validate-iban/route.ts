import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { iban } = await request.json();
    const cleanIban = iban?.replace(/\s+/g, '').toUpperCase();

    if (!cleanIban || cleanIban.length < 15) {
      return NextResponse.json({ valid: false, bankName: null, error: 'IBAN demasiado corto' });
    }

    const apiKey = process.env.IBANFORGE_API_KEY;
    
    // Si no hay API key, devolvemos un error claro para que lo veas en los logs
    if (!apiKey) {
      console.error("❌ FALTA LA VARIABLE DE ENTORNO IBANFORGE_API_KEY");
      return NextResponse.json({ valid: false, bankName: null, error: 'API Key no configurada en el servidor' }, { status: 500 });
    }

    console.log(`Validando IBAN: ${cleanIban} con IBANforge...`);

    const res = await fetch('https://api.ibanforge.com/v1/iban/validate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ iban: cleanIban }),
    });

    const data = await res.json();
    
    // Si IBANforge devuelve un error (como clave inválida), lo mostramos
    if (!res.ok) {
      console.error("❌ Error de IBANforge:", data);
      return NextResponse.json({ valid: false, bankName: null, error: data.message || 'Error en IBANforge' }, { status: res.status });
    }

    // Si el IBAN es válido y tiene banco, lo devolvemos
    if (data.valid && data.bankName) {
      return NextResponse.json({ valid: true, bankName: data.bankName });
    } 
    
    // Si es válido pero no hay banco (raro en España, pero posible)
    if (data.valid) {
      return NextResponse.json({ valid: true, bankName: "Banco no identificado" });
    }

    // Si no es válido
    return NextResponse.json({ valid: false, bankName: null, error: 'IBAN no válido según IBANforge' });

  } catch (error: any) {
    console.error('🔥 [Error en validate-iban]:', error);
    return NextResponse.json({ valid: false, bankName: null, error: error.message }, { status: 500 });
  }
}
