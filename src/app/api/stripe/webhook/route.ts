// src/app/api/stripe/webhook/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";
import * as admin from "firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET!;

// --- Inicialización de Firebase Admin ---
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
    if (serviceAccount.private_key) {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: "waevo-wallet",
    });
  } catch (error) {
    console.error("❌ Error inicializando Firebase Admin en webhook:", error);
  }
}

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature")!;
  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
  } catch (err: any) {
    console.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    return NextResponse.json({ error: `Webhook Error: ${err.message}` }, { status: 400 });
  }

  // --- Manejo de autorización en tiempo real ---
  if (event.type === "issuing_authorization.request") {
    const auth = event.data.object as Stripe.Issuing.Authorization;
    const cardId = auth.card.id;

    // ✅ Verificar que pending_request existe antes de acceder a .amount
    if (!auth.pending_request || typeof auth.pending_request.amount !== "number") {
      console.warn(`⚠️ Autorización ${auth.id} sin pending_request válido.`);
      return NextResponse.json({ error: "No pending request" }, { status: 400 });
    }
    const amount = auth.pending_request.amount; // En centavos (ej. 1000 = 10.00 EUR)

    const db = admin.firestore();

    // 1. Buscar al usuario por el ID de la tarjeta
    const usersSnap = await db
      .collection("users")
      .where("stripeCardId", "==", cardId)
      .limit(1)
      .get();

    if (usersSnap.empty) {
      console.warn(`⚠️ Tarjeta ${cardId} no asociada a ningún usuario.`);
      // ✅ CORRECCIÓN: Se elimina el parámetro { reason: ... }
      await stripe.issuing.authorizations.decline(auth.id);
      return NextResponse.json({ ok: true });
    }

    const userDoc = usersSnap.docs[0];
    const userId = userDoc.id;

    // 2. Calcular saldo total del usuario en EUR
    const balancesSnap = await db
      .collection("users")
      .doc(userId)
      .collection("balances")
      .get();

    let totalEur = 0;
    for (const doc of balancesSnap.docs) {
      const data = doc.data();
      if (data.amount && data.priceEur) {
        totalEur += data.amount * data.priceEur;
      }
    }

    // 3. Verificar si hay saldo suficiente (amount está en centavos)
    if (totalEur * 100 >= amount) {
      // Aprobar la transacción en Stripe
      await stripe.issuing.authorizations.approve(auth.id);

      // 4. Descontar saldo de Firestore de forma atómica
      try {
        await db.runTransaction(async (t) => {
          const balancesRef = db.collection("users").doc(userId).collection("balances");
          const freshSnap = await t.get(balancesRef);

          let remainingToDeduct = amount / 100; // Convertir a EUR

          for (const doc of freshSnap.docs) {
            const data = doc.data();
            if (!data.amount || !data.priceEur) continue;

            const availableEur = data.amount * data.priceEur;
            if (availableEur <= 0) continue;

            if (remainingToDeduct <= 0) break;

            const deductEur = Math.min(availableEur, remainingToDeduct);
            const deductCoin = deductEur / data.priceEur;
            const newAmount = Math.max(0, data.amount - deductCoin);

            t.update(doc.ref, { amount: newAmount });
            remainingToDeduct -= deductEur;
          }

          if (remainingToDeduct > 0.01) {
            throw new Error("Saldo insuficiente tras el cálculo atómico");
          }
        });
        console.log(`✅ Pago aprobado y saldo descontado para usuario ${userId}`);
      } catch (err: any) {
        console.error(`❌ Error descontando saldo: ${err.message}`);
        // Si falla el descuento, declinamos la autorización.
        // ✅ CORRECCIÓN: Se elimina el parámetro { reason: ... }
        await stripe.issuing.authorizations.decline(auth.id);
        return NextResponse.json({ error: "Error descontando saldo" }, { status: 500 });
      }
    } else {
      // Saldo insuficiente
      console.log(`❌ Saldo insuficiente para usuario ${userId}. Necesita ${amount / 100} EUR, tiene ${totalEur} EUR.`);
      // ✅ CORRECCIÓN: Se elimina el parámetro { reason: ... }
      await stripe.issuing.authorizations.decline(auth.id);
    }
  }

  return NextResponse.json({ received: true });
}
