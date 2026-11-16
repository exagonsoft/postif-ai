import { NextResponse } from "next/server";
import { BillingBusyError, BillingError, verifyPayPalWebhook, type PayPalEvent } from "@/lib/paypal";
import { processBillingEvent } from "@/lib/subscriptions";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    if (!request.headers.get("paypal-transmission-sig")) return NextResponse.json({ error: "Missing PayPal signature." }, { status: 400 });
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 65536) return NextResponse.json({ error: "Webhook body is too large." }, { status: 413 });
    const input: unknown = JSON.parse(raw);
    if (!input || typeof input !== "object" || !("id" in input) || typeof input.id !== "string" || input.id.length > 128 ||
      !("event_type" in input) || typeof input.event_type !== "string" || input.event_type.length > 128 ||
      !("resource" in input) || !input.resource || typeof input.resource !== "object" || Array.isArray(input.resource)) {
      return NextResponse.json({ error: "Invalid PayPal event." }, { status: 400 });
    }
    const event = input as PayPalEvent;
    await verifyPayPalWebhook(request.headers, event);
    await processBillingEvent(event);
    return NextResponse.json({ received: true });
  } catch (error) {
    const busy = error instanceof BillingBusyError;
    const status = error instanceof SyntaxError ? 400 : busy ? 503 : error instanceof BillingError ? error.status : 503;
    const details = { type: error instanceof Error ? error.name : "unknown", status,
      ...(error instanceof BillingError ? { reason: error.message } : {}) };
    if (busy) console.warn("PayPal webhook deferred", details);
    else console.error("PayPal webhook failed", details);
    return NextResponse.json({
      error: error instanceof BillingError ? error.message : "Webhook processing failed. Retry delivery.",
      ...(busy ? { code: error.code } : {}),
    }, { status, ...(busy ? { headers: { "Retry-After": String(error.retryAfter) } } : {}) });
  }
}
