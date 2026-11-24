/**
 * Cliente mínimo para la API REST de Lithic (https://docs.lithic.com).
 * Usa fetch directamente para no depender de un SDK adicional.
 * Define LITHIC_ENVIRONMENT=sandbox para usar el entorno de pruebas.
 */
function getBaseUrl() {
  return process.env.LITHIC_ENVIRONMENT === 'sandbox'
    ? 'https://sandbox.lithic.com/v1'
    : 'https://api.lithic.com/v1';
}

export async function lithicRequest<T = any>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const apiKey = process.env.LITHIC_API_KEY;
  if (!apiKey) {
    throw new Error('Falta LITHIC_API_KEY en las variables de entorno');
  }

  const res = await fetch(`${getBaseUrl()}${path}`, {
    method,
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.message || `Lithic respondió con estado ${res.status}`);
  }
  return data as T;
}
