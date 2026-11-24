import * as admin from 'firebase-admin';

/**
 * Devuelve una instancia inicializada de Firebase Admin.
 * La inicialización es perezosa para que el build no falle si
 * FIREBASE_SERVICE_ACCOUNT no está disponible en tiempo de compilación.
 */
export function getAdmin() {
  if (!admin.apps.length) {
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountString) {
      throw new Error('Falta FIREBASE_SERVICE_ACCOUNT en las variables de entorno');
    }
    const serviceAccount = JSON.parse(serviceAccountString);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: 'waevo-wallet',
    });
  }
  return admin;
}
