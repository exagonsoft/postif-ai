import { z } from "zod";
import { SocialProviderError } from "./social-provider";

export type InstagramDiagnosticStage = "code_exchange" | "token_debug" | "client_business" | "account_discovery";

function report(data: object) {
  if (process.env.NODE_ENV === "development") console.warn("[Instagram OAuth diagnostic]", JSON.stringify(data));
}

export async function instagramDiagnosticRequest<T>(stage: InstagramDiagnosticStage, operation: () => Promise<T>): Promise<T> {
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

export function reportInstagramProviderError(stage: string, httpStatus: number, code: number | null, subcode: number | null) {
  report({ stage, status: "provider_rejected", httpStatus, providerCode: code, providerSubcode: subcode });
}

export function reportInstagramToken(type: string, valid: boolean, appMatches: boolean, scopes: string[]) {
  report({ stage: "token_validation", tokenType: ["SYSTEM_USER", "USER", "PAGE"].includes(type) ? type : "OTHER",
    valid, appMatches, basic: scopes.includes("instagram_basic"), publish: scopes.includes("instagram_content_publish") });
}

export function reportInstagramRejection(stage: string, code: string) {
  const stages = ["callback_session", "callback_state", "callback_provider_response", "callback_discovery", "callback_selection_ticket",
    "selection_read", "selection", "selection_page", "start"];
  const codes = ["AUTHORIZATION_FAILED", "AUTHORIZATION_DENIED", "INVALID_REQUEST", "STATE_INVALID", "PERMISSION_MISSING",
    "INSTAGRAM_TOKEN_INVALID", "INSTAGRAM_ASSET_MISSING", "INSTAGRAM_PROVIDER_REJECTED", "MANAGED_APP_CHANGED",
    "PROVIDER_UNAVAILABLE", "TOKEN_EXPIRED", "CHANNEL_LIMIT", "BRAND_LIMIT", "APPROVAL_REQUIRED", "NOT_CONFIGURED",
    "DISCOVERY_INCOMPLETE", "FORBIDDEN", "ACCOUNT_UNSUPPORTED", "REQUEST_FORMAT", "REQUEST_CROSS_SITE", "REQUEST_ORIGIN"];
  report({ stage: stages.includes(stage) ? stage : "other", outcome: "rejected", code: codes.includes(code) ? code : "OTHER" });
}
