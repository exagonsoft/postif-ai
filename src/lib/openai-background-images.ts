import { createHash } from "node:crypto";
import { deadlineSignal } from "./worker-budget";

export function backgroundImageModelSupported(model: string) {
  return /^(gpt-image-1\.5|gpt-image-1-mini|gpt-image-2|gpt-image-2\.5-(sunburst|flare))(-\d{4}-\d{2}-\d{2})?$/.test(model);
}
export interface BackgroundImageResponse {
  id: string;
  status: "queued" | "in_progress" | "completed" | "failed" | "cancelled" | "incomplete";
  output?: { type: string; result?: string; status?: string }[];
  usage?: { total_tokens?: number };
}
export async function submitBackgroundImage(params: {
  key: string; model: string; responseModel: string; prompt: string; aspectRatio: string;
  workspaceId: number; assetId: number; deadline: number;
}) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${params.key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: params.responseModel, background: true, store: true,
      input: `Generate exactly one image for this supplied creative brief:\n${params.prompt}`,
      tools: [{ type: "image_generation", model: params.model,
        size: params.aspectRatio === "1:1" ? "1024x1024" : params.aspectRatio === "9:16" ? "1024x1536" : "1536x1024",
        output_format: "png", action: "generate" }],
      tool_choice: { type: "image_generation" },
      max_tool_calls: 1,
      safety_identifier: createHash("sha256").update(`postif-workspace:${params.workspaceId}`).digest("hex"),
      metadata: { media_request: String(params.assetId) },
    }),
    signal: deadlineSignal(params.deadline - 500, 6000),
  });
  if (!response.ok) throw new Error(`OpenAI background image submission returned HTTP ${response.status}. Verify access to both configured models and background response storage.`);
  const data = await response.json() as BackgroundImageResponse;
  if (typeof data.id !== "string" || !/^resp_[A-Za-z0-9_-]+$/.test(data.id)) throw new Error("OpenAI returned no durable background response ID. Verify provider usage; this request will not be resubmitted.");
  return data;
}
export async function pollBackgroundImage(key: string, id: string, deadline: number) {
  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` }, signal: deadlineSignal(deadline - 1000, 6000),
  });
  if (response.status === 429 || response.status >= 500) return null;
  if (!response.ok) throw new Error(`OpenAI background image status returned HTTP ${response.status}. Verify credentials and response-retention policy; this image will not be regenerated automatically.`);
  const data = await response.json() as BackgroundImageResponse;
  if (data.id !== id) throw new Error("OpenAI returned a mismatched background response ID.");
  return data;
}
export function backgroundImageResult(data: BackgroundImageResponse) {
  if (["queued", "in_progress"].includes(data.status)) return null;
  if (data.status !== "completed") throw new Error(`OpenAI background image ended with status ${data.status || "unknown"}.`);
  const image = data.output?.find(item => item.type === "image_generation_call" && item.result);
  if (!image?.result) throw new Error("OpenAI completed the response without an image generation result.");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(image.result) || image.result.length > 70 * 1024 * 1024) throw new Error("OpenAI returned invalid or oversized image data.");
  return { bytes: Buffer.from(image.result, "base64"), tokens: Number.isSafeInteger(data.usage?.total_tokens) && data.usage!.total_tokens! >= 0 ? data.usage!.total_tokens! : 0 };
}
