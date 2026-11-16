import { NextResponse } from "next/server";
import { getAuthContext } from "@/lib/auth";
import { getAdminCatalog, manageCatalog, readCatalogVersionSources, requireCatalogOperator, verifyCatalogVersion } from "@/lib/billing-catalog";
import { BillingError, checkPayPalCatalogConnection } from "@/lib/paypal";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;
function failure(error: unknown) {
  console.error("Catalog operation failed", { type: error instanceof Error ? error.name : "unknown" });
  return NextResponse.json({ error: error instanceof BillingError ? error.message : "Catalog operation failed. No success was recorded; retry or reconcile the pending publication." }, {
    status: error instanceof BillingError ? error.status : 500, headers: { "Cache-Control": "private, no-store" },
  });
}
export async function GET(request: Request) {
  try {
    const actor = await getAuthContext();
    requireCatalogOperator(actor);
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !["checkConnection", "verifyVersionId", "readVersionId"].includes(key)) ||
      [...params.keys()].length > 1) throw new BillingError("Use a single catalog verification parameter.", 400);
    const options = { headers: { "Cache-Control": "private, no-store" } };
    if (params.has("checkConnection")) {
      if (params.get("checkConnection") !== "true") throw new BillingError("Invalid connection verification request.", 400);
      return NextResponse.json(await checkPayPalCatalogConnection(), options);
    }
    if (params.has("verifyVersionId")) {
      const value = params.get("verifyVersionId") || "";
      if (!/^\d+$/.test(value)) throw new BillingError("Invalid catalog version identifier.", 400);
      return NextResponse.json(await verifyCatalogVersion(actor, Number(value)), options);
    }
    if (params.has("readVersionId")) {
      const value = params.get("readVersionId") || "";
      if (!/^\d+$/.test(value)) throw new BillingError("Invalid catalog version identifier.", 400);
      return NextResponse.json(await readCatalogVersionSources(actor, Number(value)), options);
    }
    return NextResponse.json(await getAdminCatalog(actor), options);
  }
  catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    const actor = await getAuthContext();
    requireCatalogOperator(actor);
    const body = await request.text();
    if (body.length > 32768) throw new BillingError("Catalog request is too large.", 413);
    let input: unknown;
    try { input = JSON.parse(body); } catch { throw new BillingError("Invalid JSON.", 400); }
    await manageCatalog(actor, input);
    return NextResponse.json(await getAdminCatalog(actor));
  } catch (error) { return failure(error); }
}
