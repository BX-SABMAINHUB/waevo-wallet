import { NextResponse } from 'next/server';
import crypto from 'crypto';

// URL de producción real de Striga
const STRIGA_BASE_URL = 'https://www.striga.com/api/v1';
const API_KEY = process.env.STRIGA_API_KEY!;
const API_SECRET = process.env.STRIGA_API_SECRET!;

// Función de firma HMAC requerida por Striga
function getStrigaHeaders(method: string, path: string, body: string) {
  const time = Date.now().toString();
  const contentHash = crypto.createHash('md5').update(body).digest('hex');
  const signatureRaw = time + method + path + contentHash;
  const signature = crypto.createHmac('sha256', API_SECRET).update(signatureRaw).digest('hex');
  
  return {
    'api-key': API_KEY,
    'Authorization': `HMAC ${time}:${signature}`,
    'Content-Type': 'application/json',
  };
}

export async function POST(request: Request) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: 'userId es obligatorio' }, { status: 400 });
    }

    const path = '/kyc/start';
    const body = JSON.stringify({ userId });

    const headers = getStrigaHeaders('POST', path, body);

    console.log(`[Striga Producción] Solicitando token KYC para usuario: ${userId}`);

    const strigaRes = await fetch(`${STRIGA_BASE_URL}${path}`, {
      method: 'POST',
      headers,
      body,
    });

    const strigaData = await strigaRes.json();

    if (!strigaRes.ok) {
      console.error('❌ [Striga KYC Error]', strigaData);
      return NextResponse.json({ 
        error: strigaData.message || 'Error al iniciar el KYC en Striga' 
      }, { status: strigaRes.status });
    }

    // Striga devuelve un token de SumSub de corta duración
    return NextResponse.json({ token: strigaData.token });

  } catch (error: any) {
    console.error('🔥 [Error en kyc-token]:', error);
    return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 });
  }
}
