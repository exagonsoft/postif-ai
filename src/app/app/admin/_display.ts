type Translate = (key: string, values?: Record<string, string | number>) => string;

const labels: Record<string, string> = {
  "Name": "name", "Email": "email", "Email verified": "emailVerified", "Created (UTC)": "created",
  "Workspace": "workspace", "Slug": "slug", "Owner ID": "ownerId", "Paid access": "paidAccess",
  "Workspace ID": "workspaceId", "PayPal subscription": "paypalSubscription", "Provider status": "providerStatus",
  "Paid snapshot": "paidSnapshot", "Interval": "interval", "Paid through (UTC)": "paidThrough",
  "Platform": "platform", "Status": "status", "Attempts": "attempts", "Scheduled (UTC)": "scheduled",
  "Error": "error", "Actor": "actor", "Action": "action", "Resource": "resource", "Timestamp (UTC)": "timestamp",
  "Role": "role", "Active sessions": "activeSessions", "Owner": "owner", "Brands": "brands",
  "Connected channels": "connectedChannels", "Publishing jobs": "publishingJobs", "AI mode": "aiMode",
  "Stored credit balance": "creditBalance", "Current paid access": "currentPaidAccess", "Environment": "environment",
  "Renewals stopped": "renewalsStopped", "Owner profile": "ownerProfile", "Subscription and payments": "subscriptionPayments",
};
const statuses = new Set([
  "ACTIVE", "CANCELLED", "SUSPENDED", "EXPIRED", "APPROVED", "APPROVAL_PENDING", "CREATED", "INACTIVE",
  "inactive", "active", "queued", "processing", "completed", "failed", "retrying", "uncertain", "cancelled",
  "pending", "published", "local_only", "verified", "unverified", "error", "running", "succeeded", "idle",
  "month", "year", "managed", "byok", "sandbox", "live", "local", "superseded", "drift", "degraded", "deferred",
]);

export function adminLabel(t: Translate, label: string) {
  return labels[label] ? t(`admin.fields.${labels[label]}`) : label;
}

export function adminStatus(t: Translate, value: string) {
  return statuses.has(value) ? `${t(`admin.status.${value.toLowerCase()}`)} (${value})` : value;
}

const phases = new Set(["sweep", "publishing", "subscriptions", "automatic_media", "ai_reconciliation", "credentials", "media", "planning", "analytics", "notifications", "billing_reconciliation", "media_upload_cleanup"]);
export function adminPhase(t: Translate, value: string) {
  return phases.has(value) ? `${t(`admin.phases.${value}`)} (${value})` : value;
}

export function adminDate(formatDate: (value: string, options?: Intl.DateTimeFormatOptions) => string, t: Translate, value: string) {
  if (value === "Not recorded" || !value) return t("admin.notRecorded");
  return Number.isNaN(Date.parse(value)) ? value : formatDate(value, { dateStyle: "medium", timeStyle: "medium", timeZone: "UTC" });
}
