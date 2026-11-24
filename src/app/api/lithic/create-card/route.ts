import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json(
    { error: 'La emisión de tarjetas aún no está disponible.' },
    { status: 501 },
  );
}
