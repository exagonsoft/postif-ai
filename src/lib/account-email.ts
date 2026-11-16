import nodemailer from "nodemailer";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { accountEmailLimits, accountTokens } from "@/db/account-schema";
import { generateSessionToken, hashPassword, hashToken } from "./crypto";
import { WorkflowError } from "./post-policy";

type Purpose = "verify_email" | "reset_password";

export async function requestAccountEmail(email: string, purpose: Purpose) {
  if (!process.env.SMTP_URL || !process.env.MAIL_FROM) throw new WorkflowError("Account email is unavailable until SMTP is configured.", 503);
  const [user] = await db.find(users, { email });
  if (!user || (purpose === "verify_email" && user.emailVerified)) return;
  const rawToken = generateSessionToken();
  const tokenHash = hashToken(rawToken);
  await db.transaction(async tx => {
    await tx.find(users, { id: user.id }, { lock: true });
    const key = `${purpose}:${user.id}`;
    const [limit] = await tx.find(accountEmailLimits, { key });
    if (limit && limit.requestedAt.getTime() > Date.now() - 60000) throw new WorkflowError("Please wait a minute before requesting another email.", 429);
    await tx.upsert(accountEmailLimits, "key", { key, userId: user.id, requestedAt: new Date() }, { requestedAt: new Date() });
    await tx.remove(accountTokens, { userId: user.id, purpose });
    await tx.insert(accountTokens, { tokenHash, userId: user.id, purpose, expiresAt: new Date(Date.now() + (purpose === "reset_password" ? 30 : 60) * 60000) });
  });
  const url = new URL(purpose === "reset_password" ? "/reset-password" : "/verify-email", process.env.APP_URL);
  url.hash = `token=${rawToken}`;
  const smtp = new URL(process.env.SMTP_URL);
  const transport = nodemailer.createTransport({
    host: smtp.hostname, port: Number(smtp.port || (smtp.protocol === "smtps:" ? 465 : 587)),
    secure: smtp.protocol === "smtps:", requireTLS: true,
    auth: smtp.username ? { user: decodeURIComponent(smtp.username), pass: decodeURIComponent(smtp.password) } : undefined,
    connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000,
  });
  try {
    await transport.sendMail({
      from: process.env.MAIL_FROM, to: email,
      subject: purpose === "reset_password" ? "Reset your POSTIF-AI password" : "Verify your POSTIF-AI email",
      text: `Open this one-use link to ${purpose === "reset_password" ? "reset your password" : "verify your email"}:\n\n${url.href}\n\nIf you did not request this, ignore this email.`,
    });
  } catch {
    await db.remove(accountTokens, { tokenHash });
    console.error("Account email delivery failed", { purpose });
    throw new WorkflowError("Account email could not be delivered. Try again later.", 503);
  } finally {
    transport.close();
  }
}

export async function completeAccountAction(rawToken: string, purpose: Purpose, password?: string) {
  if (!/^[a-f0-9]{64}$/.test(rawToken)) throw new WorkflowError("This link is invalid or expired.");
  if (purpose === "reset_password" && (!password || password.length < 12 || password.length > 1024)) throw new WorkflowError("Use a password of 12 to 1024 characters.");
  const passwordHash = purpose === "reset_password" ? hashPassword(password!) : null;
  return db.transaction(async tx => {
    const [token] = await tx.find(accountTokens, { tokenHash: hashToken(rawToken), purpose }, { lock: true });
    if (!token || token.expiresAt <= new Date()) throw new WorkflowError("This link is invalid or expired.");
    await tx.find(users, { id: token.userId }, { lock: true });
    if (passwordHash) {
      await tx.update(users, { id: token.userId }, { passwordHash, emailVerified: true });
      await tx.remove(sessions, { userId: token.userId });
      await tx.remove(accountTokens, { userId: token.userId });
    } else {
      await tx.update(users, { id: token.userId }, { emailVerified: true });
      await tx.remove(accountTokens, { tokenHash: token.tokenHash });
    }
    return { ok: true };
  });
}
