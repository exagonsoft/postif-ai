import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const sessionCookie = "postify_session";
const sessionDurationSeconds = 60 * 60 * 24 * 7;

function sessionKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is not configured.");
  return new TextEncoder().encode(secret);
}

export async function createSession(user: { id: string; email: string; name: string }) {
  const expiresAt = new Date(Date.now() + sessionDurationSeconds * 1000);
  const token = await new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${sessionDurationSeconds}s`)
    .sign(sessionKey());
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", expires: expiresAt, path: "/" });
}

export async function deleteSession() {
  const cookieStore = await cookies();
  cookieStore.delete(sessionCookie);
}

export async function getSessionUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, sessionKey());
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") return null;
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch { return null; }
}