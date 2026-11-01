import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    // 1. Recibimos los datos de la transacción que Tatum KMS nos envía para validar
    const body = await request.json();
    
    console.log('🔍 [Four-Eye Principle] Solicitud de validación recibida:', JSON.stringify(body, null, 2));

    // 2. Aquí podrías añadir reglas de negocio extra para mayor seguridad.
    // Ejemplo: Si la cantidad supera los 10.000€, podrías rechazarla o requerir 2FA.
    // Por ahora, para tu flujo, simplemente aprobamos todas las transacciones.

    // 3. Respondemos con un 200 OK para dar "luz verde" a la firma
    return NextResponse.json({ 
      approved: true, 
      message: "Transacción validada correctamente por el servidor externo." 
    }, { 
      status: 200 
    });

  } catch (error: any) {
    console.error('❌ [Four-Eye Principle] Error validando transacción:', error.message);
    
    // Si hay un error, devolvemos un 400 o 500 para que el KMS rechace la firma
    return NextResponse.json({ 
      approved: false, 
      error: "Error interno validando la transacción" 
    }, { 
      status: 500 
    });
  }
}
