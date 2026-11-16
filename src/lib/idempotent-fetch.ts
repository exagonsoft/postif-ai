export function createIdempotentFetcher() {
  // Retain interrupted/uncertain requests so retries cannot start another paid operation.
  const pending = new Map<string, string>();
  return async (url: string, init: RequestInit): Promise<Response> => {
    if (typeof init.body !== "string") throw new Error("An idempotent request requires a JSON body.");
    const signature = `${url}\n${init.body}`;
    const key = pending.get(signature) ?? crypto.randomUUID();
    pending.set(signature, key);
    const headers = new Headers(init.headers);
    headers.set("Idempotency-Key", key);
    const response = await fetch(url, { ...init, headers });
    const result: unknown = await response.clone().json();
    if (response.ok && result !== null && typeof result === "object" && "ok" in result && result.ok === true) pending.delete(signature);
    return response;
  };
}
