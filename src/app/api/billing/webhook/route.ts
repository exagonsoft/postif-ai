import { NextResponse } from "next/server";
import { requireBilling } from "@/lib/stripe";
import { processBillingEvent } from "@/lib/subscriptions";
export const runtime = "nodejs";
export async function POST(request: Request) {
  let stripe;
  try { stripe = requireBilling(); }
  catch { return NextResponse.json({ error: "Billing webhook is not configured." }, { status: 503 }); }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing Stripe signature." }, { status: 400 });
  const raw = await request.text();
  let event;
  try { event = stripe.webhooks.constructEvent(raw, signature, process.env.STRIPE_WEBHOOK_SECRET!); }
  catch { return NextResponse.json({ error: "Invalid Stripe signature." }, { status: 400 }); }
  try {
    await processBillingEvent(event);
    return NextResponse.json({ received: true });
  } catch {
    // A non-2xx keeps Stripe's retry machinery active for durable failed events.
    return NextResponse.json({ error: "Webhook processing failed. Retry delivery." }, { status: 503 });
  }
}
