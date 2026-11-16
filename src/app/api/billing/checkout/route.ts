import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createBillingCheckout } from "@/lib/subscriptions";
import { BillingError } from "@/lib/stripe";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (ctx.memberRole !== "owner") return NextResponse.json({ error: "Only the workspace owner can manage subscriptions." }, { status: 403 });
    const body = await request.json();
    if (typeof body.planSlug !== "string" || !["monthly", "annual"].includes(body.billingCycle)) return NextResponse.json({ error: "Choose a paid catalog plan and billing cycle." }, { status: 400 });
    const url = await createBillingCheckout(ctx.workspace.id, body.planSlug, body.billingCycle === "annual" ? "year" : "month");
    return NextResponse.json({ url });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BillingError ? error.message : "Checkout could not be created. Please retry." }, { status: error instanceof BillingError ? error.status : 502 });
  }
}
