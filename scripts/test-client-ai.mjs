import assert from "node:assert/strict";
import "./register-ts.mjs";
const { createIdempotentFetcher } = await import("../src/lib/idempotent-fetch.ts");
const request = createIdempotentFetcher();
const originalFetch = globalThis.fetch;
const calls = [];
let mode = "network-error";
globalThis.fetch = async (url, init) => {
  calls.push({ url, key: new Headers(init.headers).get("Idempotency-Key") });
  if (mode === "network-error") throw new Error("Network interrupted");
  if (mode === "unknown-result") return Response.json({ error: "Still reconciling" }, { status: 409 });
  return Response.json({ ok: true });
};
try {
  const input = { method: "POST", body: JSON.stringify({ mode: "generate", topic: "Customer input" }) };
  await assert.rejects(request("/api/ai/generate", input), /interrupted/);
  mode = "unknown-result";
  await request("/api/ai/generate", input);
  assert.equal(calls[0].key, calls[1].key, "An interrupted request reuses its durable idempotency key");
  mode = "success";
  await request("/api/ai/generate", input);
  assert.equal(calls[1].key, calls[2].key, "An uncertain result must not produce a new paid request");
  await request("/api/ai/generate", input);
  assert.notEqual(calls[2].key, calls[3].key, "A deliberate new action after success gets a fresh key");
  mode = "unknown-result";
  await request("/api/ai/generate", input);
  await request("/api/ai/generate", { ...input, body: JSON.stringify({ mode: "generate", topic: "A different customer input" }) });
  assert.notEqual(calls[4].key, calls[5].key, "Different payloads cannot accidentally reuse a pending request");
  console.log("Client AI retry checks passed: interrupted/uncertain request reuse, new successful actions, and payload isolation.");
} finally {
  globalThis.fetch = originalFetch;
}
