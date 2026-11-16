import { NextResponse } from "next/server";
import { db } from "@/db";
import { notificationPreferences, pushSubscriptions } from "@/db/schema";
import { and, eq } from "@/db/filters";
import { getAuthContext } from "@/lib/auth";
import { notificationReadiness } from "@/lib/notification-service";
import { z } from "zod";
export async function GET() {
    const ctx = await getAuthContext();
    if (!ctx)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const [preferences] = await db.find(notificationPreferences, eq("userId", ctx.user.id), {});
    return NextResponse.json({ preferences: preferences ?? { onsite: true, email: false, push: false }, readiness: notificationReadiness(), publicKey: process.env.VAPID_PUBLIC_KEY || "" });
}
export async function POST(req: Request) {
    const ctx = await getAuthContext();
    if (!ctx)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    try {
        const body = await req.json();
        if (body.action === "subscribe") {
            const subscription = z.object({ endpoint: z.url().max(2048), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(10).max(100) }) }).parse(body.subscription);
            const url = new URL(subscription.endpoint);
            const trusted = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com", "wns.windows.com"];
            if (url.protocol !== "https:" || url.port || url.username || url.password || !trusted.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`))) {
                return NextResponse.json({ error: "Unsupported push service." }, { status: 400 });
            }
            await db.upsert(pushSubscriptions, "endpoint", { userId: ctx.user.id, endpoint: subscription.endpoint, ...subscription.keys }, { userId: ctx.user.id, ...subscription.keys });
        }
        else if (body.action === "unsubscribe") {
            await db.remove(pushSubscriptions, and(eq("userId", ctx.user.id), eq("endpoint", String(body.endpoint))));
        }
        else {
            const preferences = z.object({ onsite: z.boolean(), email: z.boolean(), push: z.boolean() }).parse(body);
            await db.upsert(notificationPreferences, "userId", { userId: ctx.user.id, ...preferences }, preferences);
        }
        return NextResponse.json({ ok: true });
    }
    catch {
        return NextResponse.json({ error: "Could not save notification settings." }, { status: 400 });
    }
}
