import { z } from "zod";
import { SocialProviderError } from "./social-provider";

export type ThreadsDiagnosticStage = "code_exchange" | "long_token_exchange" | "token_debug" | "account_discovery";

function report(data: object) {
  if (process.env.NODE_ENV === "development") console.warn("[Threads OAuth diagnostic]", JSON.stringify(data));
}

export async function threadsDiagnosticRequest<T>(stage: ThreadsDiagnosticStage, operation: () => Promise<T>): Promise<T> {
  try {
    const result = await operation();
    report({ stage, status: "ok" });
    return result;
  } catch (error) {
    report({ stage, status: error instanceof z.ZodError ? "invalid_response" : error instanceof SocialProviderError ? "provider_error" : "internal_error",
      ...(error instanceof SocialProviderError ? { httpStatus: error.status } : {}) });
    throw error;
  }
}

export type ThreadsErrorHint = "client_secret" | "client_id" | "redirect_uri" | "authorization_code" | "other";

export function reportThreadsProviderError(stage: string, httpStatus: number, code: number | null, subcode: number | null, hint?: ThreadsErrorHint) {
  report({ stage, status: "provider_rejected", httpStatus, providerCode: code, providerSubcode: subcode, hint: hint || "other" });
}

export function reportThreadsRejection(stage: string, code: string) {
  const stages = ["callback_session", "callback_state", "callback_provider_response", "callback_discovery", "callback_selection_ticket",
    "selection_read", "selection", "selection_page", "start"];
  const codes = ["AUTHORIZATION_FAILED", "AUTHORIZATION_DENIED", "INVALID_REQUEST", "STATE_INVALID", "PERMISSION_MISSING",
    "MANAGED_APP_CHANGED", "PROVIDER_UNAVAILABLE", "TOKEN_EXPIRED", "CHANNEL_LIMIT", "BRAND_LIMIT", "APPROVAL_REQUIRED",
    "NOT_CONFIGURED", "FORBIDDEN", "ACCOUNT_UNSUPPORTED", "REQUEST_FORMAT", "REQUEST_CROSS_SITE", "REQUEST_ORIGIN"];
  report({ stage: stages.includes(stage) ? stage : "other", outcome: "rejected", code: codes.includes(code) ? code : "OTHER" });
}
