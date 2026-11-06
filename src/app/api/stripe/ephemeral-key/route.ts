// src/app/api/stripe/ephemeral-key/route.ts
import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

export async function POST(req: Request) {
  try {
    const { cardId } = await req.json();
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { issuing_card: cardId },
      { apiVersion: "2024-06-20" }
    );
    return NextResponse.json({ ephemeralKeySecret: ephemeralKey.secret });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
