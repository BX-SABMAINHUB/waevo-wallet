// src/app/api/stripe/create-card/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)),
  });
}

export async function POST(req: Request) {
  try {
    const { userId } = await req.json();
    const db = admin.firestore();
    const userSnap = await db.collection("users").doc(userId).get();
    const userData = userSnap.data();

    // 1. Verificar aprobación de acceso
    const requestSnap = await db.collection("cardRequests").doc(userId).get();
    if (!requestSnap.exists || requestSnap.data()?.approved !== true) {
      return NextResponse.json({ error: "Acceso no aprobado" }, { status: 403 });
    }

    // 2. Crear cardholder si no existe
    let cardholderId = userData?.stripeCardholderId;
    if (!cardholderId) {
      const cardholder = await stripe.issuing.cardholders.create({
        type: "individual",
        name: userData?.displayName || "Usuario Waevo",
        email: userData?.email || "user@waevo.com",
        billing: { address: { line1: "Calle Falsa 123", city: "Madrid", country: "ES", postal_code: "28001" } },
      });
      cardholderId = cardholder.id;
      await db.collection("users").doc(userId).set({ stripeCardholderId: cardholderId }, { merge: true });
    }

    // 3. Crear tarjeta virtual
    const card = await stripe.issuing.cards.create({
      cardholder: cardholderId,
      currency: "eur",
      type: "virtual",
      status: "active",
      spending_controls: { spending_limits: [{ amount: 30000, interval: "all_time" }] },
    });

    return NextResponse.json({ card: { id: card.id, last4: card.last4, expMonth: card.exp_month, expYear: card.exp_year } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
