import { createHash } from "node:crypto";

export function credentialVersion(mode: string, secret: string, model = "") {
  return createHash("sha256").update(JSON.stringify([mode, secret, model])).digest("hex");
}
export function requestFingerprint(operation: string, prompt: string, input: object) {
  const data = Object.fromEntries(Object.entries(input).filter(([key]) => !["requestKey", "deadline"].includes(key)));
  function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object" && !(value instanceof Date)) {
      return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonical(entry)]));
    }
    return value;
  }
  return createHash("sha256").update(JSON.stringify([operation, prompt, canonical(data)])).digest("hex");
}
export function validCreditBalance(balance: number) {
  if (!Number.isSafeInteger(balance) || balance < 0) throw new Error("AI credit balance requires administrator reconciliation.");
}
export function validReservationCredits(credits: number, billingMode: string) {
  if (!["byok", "managed"].includes(billingMode) || !Number.isSafeInteger(credits) || credits < 0 || (billingMode === "byok" && credits !== 0)) {
    throw new Error("AI reservation credits require administrator reconciliation.");
  }
}
