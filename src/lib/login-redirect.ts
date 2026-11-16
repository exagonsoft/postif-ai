export function resolveLoginRedirect(destination: unknown, next: string | null) {
  if (destination === "/app/admin") return "/app/admin";
  return next === "/onboarding" || next === "/onboarding?mode=create" ? next : "/app";
}
