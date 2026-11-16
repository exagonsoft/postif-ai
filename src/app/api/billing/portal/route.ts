import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { createBillingPortal } from "@/lib/subscriptions";
import { BillingError } from "@/lib/stripe";
export const runtime = "nodejs";
export async function POST() {
  try {
    const ctx = await getAuthContext();
    if (!ctx?.workspace) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (ctx.memberRole !== "owner") return NextResponse.json({ error: "Only the workspace owner can manage subscriptions." }, { status: 403 });
    return NextResponse.json({ url: await createBillingPortal(ctx.workspace.id) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof BillingError ? error.message : "Billing portal is unavailable. Please retry." }, { status: error instanceof BillingError ? error.status : 502 });
  }
}
