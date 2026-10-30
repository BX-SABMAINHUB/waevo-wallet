import { NextResponse } from 'next/server';
import * as admin from 'firebase-admin';
import emailjs from '@emailjs/nodejs';

// Inicializar Firebase Admin de forma segura
if (!admin.apps.length) {
  try {
    // En Vercel, esta variable contendrá el JSON de la cuenta de servicio
    const serviceAccountString = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountString) {
      console.warn('Falta FIREBASE_SERVICE_ACCOUNT en las variables de entorno.');
    } else {
      const serviceAccount = JSON.parse(serviceAccountString);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }
  } catch (error) {
    console.error('Error al inicializar Firebase Admin:', error);
  }
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'El correo es obligatorio' }, { status: 400 });
    }

    // 1. Generar el enlace oficial de verificación de Firebase
    // (El usuario irá aquí después de hacer clic en el correo)
    const verificationLink = await admin.auth().generateEmailVerificationLink(email, {
      url: 'https://waevo-wallet.vercel.app/login', 
    });

    // 2. Enviar el correo a través de EmailJS
    await emailjs.send(
      process.env.EMAILJS_SERVICE_ID!,
      process.env.EMAILJS_TEMPLATE_ID!,
      {
        to_email: email,
        verification_link: verificationLink,
      },
      {
        publicKey: process.env.EMAILJS_PUBLIC_KEY!,
        privateKey: process.env.EMAILJS_PRIVATE_KEY!,
      }
    );

    return NextResponse.json({ success: true, message: 'Correo enviado correctamente' });
  } catch (error: any) {
    console.error('Error en API de verificación:', error);
    return NextResponse.json(
      { error: error.message || 'Error interno del servidor' }, 
      { status: 500 }
    );
  }
}
