import { NextResponse } from 'next/server';
import { identifyBank, isValidIBAN } from 'iban-bank-identifier';

export async function POST(request: Request) {
  try {
    const { iban } = await request.json();
    const cleanIban = iban?.replace(/\s+/g, '').toUpperCase();

    if (!cleanIban || cleanIban.length < 15) {
      return NextResponse.json({ valid: false, bankName: null, error: 'IBAN demasiado corto' });
    }

    // 1. Validar que el IBAN sea matemáticamente correcto
    if (!isValidIBAN(cleanIban)) {
      return NextResponse.json({ valid: false, bankName: null, error: 'IBAN no válido' });
    }

    // 2. Identificar el banco usando la base de datos offline
    const result = identifyBank(cleanIban);
    
    if (result.valid && result.bank?.name) {
      return NextResponse.json({ valid: true, bankName: result.bank.name });
    } else {
      return NextResponse.json({ valid: true, bankName: "Banco no identificado" });
    }

  } catch (error: any) {
    console.error('🔥 [Error en validate-iban]:', error);
    return NextResponse.json({ valid: false, bankName: null, error: 'Error interno validando el IBAN' }, { status: 500 });
  }
}
