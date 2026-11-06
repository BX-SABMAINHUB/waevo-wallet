// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!)),
  });
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  if (event.type === "issuing_authorization.request") {
    const auth = event.data.object as Stripe.Issuing.Authorization;
    const cardId = auth.card.id;
    const amount = auth.pending_request.amount;

    const db = admin.firestore();
    // Buscar al usuario por cardId
    const usersSnap = await db.collection("users").where("stripeCardId", "==", cardId).limit(1).get();
    if (usersSnap.empty) {
      await stripe.issuing.authorizations.decline(auth.id, { reason: "card_not_active" });
      return NextResponse.json({ ok: true });
    }
    const userId = usersSnap.docs[0].id;

    // Verificar saldo total en la billetera (suma de balances)
    const balancesSnap = await db.collection("users").doc(userId).collection("balances").get();
    let totalEur = 0;
    for (const doc of balancesSnap.docs) {
      const data = doc.data();
      if (data.amount && data.priceEur) totalEur += data.amount * data.priceEur;
    }

    if (totalEur * 100 >= amount) {
      await stripe.issuing.authorizations.approve(auth.id);
      // Opcional: descontar saldo de forma atómica en un transaction
      await db.runTransaction(async (t) => {
        // Lógica para restar el equivalente en la moneda principal (ej. USDT)
      });
    } else {
      await stripe.issuing.authorizations.decline(auth.id, { reason: "insufficient_funds" });
    }
  }

  return NextResponse.json({ received: true });
}
