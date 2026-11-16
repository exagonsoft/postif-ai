import { createHmac, timingSafeEqual } from "node:crypto";

function signature(id: number, expires: number, format: "original" | "jpeg") {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Configure ENCRYPTION_SECRET before publishing media.");
  return createHmac("sha256", secret).update(`publishing-media:${id}:${expires}:${format}`).digest("hex");
}

export function publishingMediaUrl(id: number, format: "original" | "jpeg" = "original") {
  if (!process.env.APP_URL) throw new Error("APP_URL is required for publishing media.");
  const url = new URL(`/api/media/${id}/publish`, process.env.APP_URL);
  if (url.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("Media publishing requires a publicly reachable HTTPS APP_URL.");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("format", format);
  url.searchParams.set("signature", signature(id, expires, format));
  return url.toString();
}

export function verifyPublishingMedia(id: number, expires: number, supplied: string, format: string = "original") {
  const now = Math.floor(Date.now() / 1000);
  if (!["original", "jpeg"].includes(format) || !Number.isSafeInteger(id) || id < 1 || !Number.isSafeInteger(expires) || expires < now || expires > now + 3600 || !/^[a-f0-9]{64}$/.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(supplied, "hex"), Buffer.from(signature(id, expires, format as "original" | "jpeg"), "hex"));
}
