import { db } from "@/db";
import { users, workspaceMembers, workspaces, notifications, notificationPreferences, notificationDeliveries, pushSubscriptions } from "@/db/schema";
import { and, eq, inArray, lte } from "@/db/filters";
import nodemailer from "nodemailer";
import * as webpush from "web-push";
import { deadlineSignal, hasTime, type WorkerOptions } from "./worker-budget";
import { workerNotices } from "@/db/worker-schema";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export async function queueWorkspaceNotification(tx: Transaction, key: string, workspaceId: number, type: string, title: string, message: string, actionHref: string, approversOnly = false) {
    await tx.insert(workerNotices, { key, workspaceId, type, title, message, actionHref, approversOnly }, { ignoreDuplicates: true });
}
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
export async function deliverNotifications({ deadline = Date.now() + 20000, limit = 5 }: WorkerOptions = {}) {
    return db.withLease("notification-delivery", async () => {
    let processed = 0;
    const notices = await db.find(workerNotices, { status: "queued", availableAt: { $lte: new Date() } }, { limit, sort: { availableAt: 1 } });
    for (const notice of notices) {
        if (!hasTime(deadline)) break;
        try {
            await db.transaction(async tx => {
                const [current] = await tx.find(workerNotices, { id: notice.id, status: "queued" }, { lock: true });
                if (!current) return;
                await notifyWorkspace(tx, current.workspaceId, current.type, current.title, current.message, current.actionHref, current.approversOnly);
                await tx.update(workerNotices, { id: current.id, status: "queued" }, { status: "completed" });
            });
        } catch {
            await db.update(workerNotices, { id: notice.id, status: "queued", attempts: notice.attempts }, { attempts: notice.attempts + 1, status: notice.attempts >= 4 ? "failed" : "queued", availableAt: new Date(Date.now() + 60000 * 2 ** notice.attempts) });
        }
    }
    await db.update(notificationDeliveries, { status: "processing", availableAt: { $lte: new Date() } }, { status: "failed", lastError: "Delivery was interrupted and may already have reached the recipient. Verify before manually retrying." });
    for (let i = 0; i < limit && hasTime(deadline, 1000); i++) {
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
            const readiness = notificationReadiness();
            if (!(item.channel === "email" ? readiness.email : readiness.push)) {
                await tx.update(notificationDeliveries, { id: item.id, status: item.status }, { availableAt: new Date(Date.now() + 3600000), lastError: "Notification provider is not configured. Delivery remains queued." });
                return true;
            }
            const claimUntil = new Date(Date.now() + 120000);
            const [claim] = await tx.update(notificationDeliveries, { id: item.id, status: item.status, availableAt: item.availableAt }, { status: "processing", availableAt: claimUntil });
            if (!claim) return true;
            let attempted = false;
            try {
                const href = new URL(item.actionHref, process.env.APP_URL).toString();
                if (item.channel === "email") {
                    const [user] = await tx.find(users, eq("id", item.userId), {});
                    if (!user)
                        throw new Error("Recipient no longer exists.");
                    const smtp = new URL(process.env.SMTP_URL!);
                    if (!["smtp:", "smtps:"].includes(smtp.protocol))
                        throw new Error("Invalid SMTP URL.");
                    const timeout = Math.max(1, Math.min(10000, deadline - Date.now() - 500));
                    const transport = nodemailer.createTransport({ host: smtp.hostname, port: Number(smtp.port || (smtp.protocol === "smtps:" ? 465 : 587)), secure: smtp.protocol === "smtps:", auth: smtp.username ? { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } : undefined, connectionTimeout: timeout, greetingTimeout: timeout, socketTimeout: timeout });
                    let timer: ReturnType<typeof setTimeout> | undefined;
                    try {
                        attempted = true;
                        await Promise.race([
                            transport.sendMail({ from: process.env.MAIL_FROM, to: user.email, subject: item.title, text: `${item.message}\n\n${href}`, messageId: `<postif-notification-${item.id}@${new URL(process.env.APP_URL!).hostname}>` }),
                            new Promise<never>((_, reject) => { timer = setTimeout(() => { transport.close(); reject(new Error("Notification deadline exceeded.")); }, timeout); }),
                        ]);
                    }
                    finally {
                        if (timer) clearTimeout(timer);
                        transport.close();
                    }
                }
                else {
                    webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
                    const subscriptions = await tx.find(pushSubscriptions, eq("userId", item.userId), {});
                    if (!subscriptions.length)
                        throw new Error("No browser is subscribed to push notifications.");
                    for (const subscription of subscriptions) {
                        if (!hasTime(deadline, 500)) throw new Error("Push deadline exceeded.");
                        try {
                            attempted = true;
                            const details = webpush.generateRequestDetails({ endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } }, JSON.stringify({ title: item.title, body: item.message, url: href, tag: `postif-${item.id}` }), { TTL: 86400 });
                            const response = await fetch(details.endpoint, { method: details.method,
                                headers: Object.fromEntries(Object.entries(details.headers).map(([key, value]) => [key, String(value)])),
                                body: new Uint8Array(details.body), redirect: "error", signal: deadlineSignal(deadline - 500, 10000) });
                            await response.body?.cancel();
                            if (!response.ok) throw Object.assign(new Error("Push provider rejected delivery."), { statusCode: response.status });
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
                await tx.update(notificationDeliveries, { id: item.id, status: "processing", availableAt: claimUntil }, { status: "sent", attempts: item.attempts + 1, lastError: null });
            }
            catch {
                await tx.update(notificationDeliveries, { id: item.id, status: "processing", availableAt: claimUntil }, { status: attempted || item.attempts >= 4 ? "failed" : "retrying", attempts: item.attempts + 1, availableAt: new Date(Date.now() + 60000 * 2 ** item.attempts), lastError: attempted ? "Delivery result is uncertain. Verify delivery before manually retrying." : "Delivery failed. Check provider configuration and recipient settings." });
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
