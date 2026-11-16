import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { requireCatalogOperator } from "@/lib/billing-catalog";
import { BillingError } from "@/lib/paypal";
import { listPayPalCatalog, readPayPalCatalogPlan } from "@/lib/paypal-catalog";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(request: Request) {
  try {
    const actor = await getAuthContext();
    requireCatalogOperator(actor);
    const params = new URL(request.url).searchParams;
    for (const key of params.keys()) {
      if (!["kind", "page", "id"].includes(key) || params.getAll(key).length !== 1) throw new BillingError("Invalid PayPal catalog query.", 400);
    }
    const kind = params.get("kind");
    if (kind !== "products" && kind !== "plans") throw new BillingError("Choose PayPal products or plans.", 400);
    if (params.has("id")) {
      if (kind !== "plans" || params.has("page")) throw new BillingError("Plan details require only kind and id.", 400);
      const id = params.get("id") || "";
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new BillingError("Invalid PayPal resource identifier.", 400);
      return NextResponse.json(await readPayPalCatalogPlan(id), { headers });
    }
    const page = params.get("page") ?? "1";
    if (!/^[1-9]\d{0,5}$/.test(page)) throw new BillingError("Invalid PayPal catalog page.", 400);
    return NextResponse.json(await listPayPalCatalog(kind, Number(page)), { headers });
  } catch (error) {
    console.error("PayPal catalog read failed", { type: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: error instanceof BillingError ? error.message : "PayPal catalog could not be loaded. Retry the read-only request." },
      { status: error instanceof BillingError ? error.status : 500, headers });
  }
}
