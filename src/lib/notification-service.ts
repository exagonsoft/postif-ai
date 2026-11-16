import { db } from "@/db";
import { users, workspaceMembers, workspaces, notifications, notificationPreferences, notificationDeliveries, pushSubscriptions } from "@/db/schema";
import { and, eq, inArray, lte } from "@/db/filters";
import nodemailer from "nodemailer";
import * as webpush from "web-push";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function notifyWorkspace(tx: Transaction, workspaceId: number, type: string, title: string, message: string, actionHref: string, approversOnly = false) {
    const members = await tx.find(workspaceMembers, and(eq("workspaceId", workspaceId), eq("status", "active")), {});
    const [workspace] = await tx.find(workspaces, eq("id", workspaceId), {});
    const recipients = new Set(members.filter(m => !approversOnly || ["owner", "admin", "approver"].includes(m.role)).map(m => m.userId).filter((id): id is number => id !== null));
    if (workspace)
        recipients.add(workspace.ownerId);
    for (const userId of recipients) {
        const [prefs] = await tx.find(notificationPreferences, eq("userId", userId), {});
        if (prefs?.onsite !== false)
            await tx.insert(notifications, { workspaceId, userId, type, title, message, actionHref });
        for (const channel of ["email", "push"] as const)
            if (prefs?.[channel]) {
                await tx.insert(notificationDeliveries, { userId, channel, title, message, actionHref });
            }
    }
}
export function notificationReadiness() {
    return { email: !!(process.env.SMTP_URL && process.env.MAIL_FROM && process.env.APP_URL), push: !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT && process.env.APP_URL) };
}
export async function deliverNotifications() {
    return db.withLease("notification-delivery", async () => {
    let processed = 0;
    // A renewable MongoDB lease serializes delivery. Network sends never run in retried transactions.
    for (let i = 0; i < 5; i++) {
        const found = await (async () => {
            const tx = db;
            const [item] = await tx.find(notificationDeliveries, and(inArray("status", ["queued", "retrying"]), lte("availableAt", new Date())), { limit: 1, sort: { id: 1 },  });
            if (!item)
                return false;
            const [prefs] = await tx.find(notificationPreferences, eq("userId", item.userId), {});
            const enabled = item.channel === "email" ? prefs?.email : prefs?.push;
            if (!enabled) {
                await tx.update(notificationDeliveries, eq("id", item.id), { status: "cancelled" });
                return true;
            }
            try {
                const readiness = notificationReadiness();
                if (!(item.channel === "email" ? readiness.email : readiness.push))
                    throw new Error("Notification provider is not configured.");
                const href = new URL(item.actionHref, process.env.APP_URL).toString();
                if (item.channel === "email") {
                    const [user] = await tx.find(users, eq("id", item.userId), {});
                    if (!user)
                        throw new Error("Recipient no longer exists.");
                    const smtp = new URL(process.env.SMTP_URL!);
                    if (!["smtp:", "smtps:"].includes(smtp.protocol))
                        throw new Error("Invalid SMTP URL.");
                    const transport = nodemailer.createTransport({ host: smtp.hostname, port: Number(smtp.port || (smtp.protocol === "smtps:" ? 465 : 587)), secure: smtp.protocol === "smtps:", auth: smtp.username ? { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } : undefined, connectionTimeout: 10000, socketTimeout: 15000 });
                    try {
                        await transport.sendMail({ from: process.env.MAIL_FROM, to: user.email, subject: item.title, text: `${item.message}\n\n${href}`, messageId: `<postif-notification-${item.id}@${new URL(process.env.APP_URL!).hostname}>` });
                    }
                    finally {
                        transport.close();
                    }
                }
                else {
                    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
                    const subscriptions = await tx.find(pushSubscriptions, eq("userId", item.userId), {});
                    if (!subscriptions.length)
                        throw new Error("No browser is subscribed to push notifications.");
                    for (const subscription of subscriptions) {
                        try {
                            await webpush.sendNotification({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: item.title, body: item.message, url: href, tag: `postif-${item.id}` }), { TTL: 86400, timeout: 10000 });
                        }
                        catch (error) {
                            const status = (error as {
                                statusCode?: number;
                            }).statusCode;
                            if (status === 404 || status === 410)
                                await tx.remove(pushSubscriptions, eq("id", subscription.id));
                            else
                                throw error;
                        }
                    }
                }
                await tx.update(notificationDeliveries, eq("id", item.id), { status: "sent", attempts: item.attempts + 1, lastError: null });
            }
            catch {
                await tx.update(notificationDeliveries, eq("id", item.id), { status: item.attempts >= 4 ? "failed" : "retrying", attempts: item.attempts + 1, availableAt: new Date(Date.now() + 60000 * 2 ** item.attempts), lastError: "Delivery failed. Check provider configuration and recipient settings." });
            }
            return true;
        })();
        if (!found)
            break;
        processed++;
    }
    return processed;
    }, 0);
}
