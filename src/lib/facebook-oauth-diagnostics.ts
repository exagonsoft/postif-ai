import { z } from "zod";
import { SocialProviderError } from "./social-provider";

const permissions = ["business_management", "pages_show_list", "pages_manage_posts", "pages_read_engagement", "pages_read_user_content"] as const;
const pageTasks = ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL", "ANALYZE", "ADVERTISE", "MODERATE", "MESSAGING"] as const;

export function facebookDiagnosticsEnabled() {
  return process.env.NODE_ENV === "development" && process.env.FACEBOOK_OAUTH_DIAGNOSTICS !== "false";
}

function report(data: object) {
  if (facebookDiagnosticsEnabled()) console.warn("[Facebook OAuth diagnostic]", JSON.stringify(data));
}

const errorCodes = new Set(["PERMISSION_MISSING", "FACEBOOK_PUBLISH_ACCESS_MISSING", "FACEBOOK_PAGE_ACCESS_MISSING", "FACEBOOK_TOKEN_INVALID",
  "FACEBOOK_USER_TOKEN_REQUIRED", "STATE_INVALID", "INVALID_REQUEST", "MANAGED_APP_CHANGED", "AUTHORIZATION_DENIED", "AUTHORIZATION_FAILED",
  "TOKEN_EXPIRED", "PROVIDER_UNAVAILABLE", "FORBIDDEN", "ACCOUNT_UNSUPPORTED", "CHANNEL_LIMIT", "BRAND_LIMIT", "APPROVAL_REQUIRED",
  "NOT_CONFIGURED", "REQUEST_FORMAT", "REQUEST_CROSS_SITE", "REQUEST_ORIGIN", "DISCOVERY_INCOMPLETE"]);

export function reportFacebookRejection(stage: string, code: string) {
  report({ stage, outcome: "rejected", code: errorCodes.has(code) ? code : "OTHER" });
}

export function reportFacebookEntry(stage: string) {
  report({ stage, outcome: "received" });
}

export function reportFacebookAuthorization(required: string[], businessConfiguration: boolean) {
  const requiredPermissions = permissions.filter(permission => required.includes(permission));
  report({ stage: "authorization_request", requestMode: businessConfiguration ? "business_configuration" : "scope",
    requestedPermissions: businessConfiguration ? null : requiredPermissions, requiredPermissions });
}

export function reportFacebookGrantCheck(stage: string, required: string[], granted: string[], businessConfiguration: boolean, page?: number) {
  const requiredPermissions = permissions.filter(permission => required.includes(permission));
  report({ stage, ...(page === undefined ? {} : { page }), requestMode: businessConfiguration ? "business_configuration" : "scope",
    requestedPermissions: businessConfiguration ? null : requiredPermissions,
    requiredPermissions, confirmedPermissions: permissions.filter(permission => granted.includes(permission)),
    missingPermissions: requiredPermissions.filter(permission => !granted.includes(permission)) });
}

export function reportFacebookProviderError(stage: string, httpStatus: number, code: number | null, subcode: number | null) {
  report({ stage, status: "provider_error", httpStatus, providerCode: code, providerSubcode: subcode });
}

export function reportFacebookLongTokenShape(value: unknown) {
  if (!facebookDiagnosticsEnabled()) return;
  const object = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const type = (name: string) => !object || !Object.hasOwn(object, name) ? "missing" : object[name] === null ? "null" : typeof object[name];
  const expiry = object?.expires_in;
  const expiryCategory = typeof expiry !== "number" ? "not_numeric" : !Number.isInteger(expiry) ? "not_integer" :
    expiry <= 0 ? "not_positive" : expiry > 315360000 ? "above_limit" : "valid";
  report({ stage: "user_long_exchange_shape", responseType: object ? "object" : "other",
    accessTokenType: type("access_token"), expiresInType: type("expires_in"), expiryCategory,
    tokenTypeField: type("token_type") });
}

export async function facebookDiagnosticRequest<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try {
    const result = await operation();
    report({ stage, status: "ok" });
    return result;
  } catch (error) {
    if (error instanceof SocialProviderError) report({ stage, status: "provider_error", httpStatus: error.status });
    else if (error instanceof z.ZodError) {
      const fields = ["access_token", "expires_in", "token_type"];
      const codes = ["invalid_type", "too_small", "too_big", "invalid_value", "invalid_format"];
      report({ stage, status: "invalid_response", issues: error.issues.slice(0, 10).map(issue => ({
        field: issue.path.length === 1 && typeof issue.path[0] === "string" && fields.includes(issue.path[0]) ? issue.path[0] : "other",
        reason: codes.includes(issue.code) ? issue.code : "other",
      })) });
    }
    throw error;
  }
}

export function reportFacebookPermissions(stage: string, granted: string[], statuses?: { permission: string; status: string }[]) {
  const entries = permissions.map(name => {
    const status = statuses?.find(item => item.permission === name)?.status;
    return { permission: name, status: statuses ? (["granted", "declined", "expired"].includes(status || "") ? status : "not_returned") : granted.includes(name) ? "granted" : "not_returned" };
  });
  report({ stage, permissions: entries });
}

export function reportFacebookPageTasks(index: number, tasks: string[]) {
  report({ stage: "page_tasks", page: index, tasks: pageTasks.filter(task => tasks.includes(task)),
    createContent: tasks.includes("CREATE_CONTENT"),
    eligibleContentTask: tasks.some(task => ["CREATE_CONTENT", "MANAGE", "PROFILE_PLUS_CREATE_CONTENT", "PROFILE_PLUS_FULL_CONTROL"].includes(task)) });
}

export function reportFacebookPageDiscovery(count: number, hasMore: boolean) {
  report({ stage: "page_discovery_result", pageCount: count, hasMore });
}

export function reportFacebookPageRestrictions(index: number, pageId: string, granular: { scope: string; target_ids?: string[] }[]) {
  const entries = permissions.filter(name => name.startsWith("pages_")).map(name => {
    const grants = granular.filter(item => item.scope === name);
    return { permission: name, status: !grants.length ? "not_reported" : grants.some(item => item.target_ids === undefined || item.target_ids.includes(pageId)) ? "included" : "excluded" };
  });
  report({ stage: "page_restrictions", page: index, permissions: entries });
}

export function reportFacebookTokenType(stage: string, type: string, valid: boolean) {
  report({ stage, tokenType: ["USER", "PAGE"].includes(type) ? type : "OTHER", valid });
}
