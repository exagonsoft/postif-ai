import { timingSafeEqual } from "node:crypto";
export function isWorkerAuthorized(request: Request) {
  const secret = process.env.WORKER_SECRET;
  if (!secret || secret.length < 32) return false;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
