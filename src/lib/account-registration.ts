import { WorkflowError } from "./post-policy";

export function validateAccountRegistration(input: { name?: unknown; email?: unknown; password?: unknown }) {
  const name = String(input.name || "").trim();
  const email = String(input.email || "").trim().toLowerCase();
  const password = String(input.password || "");
  if (!name || name.length > 200 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    password.length < 12 || password.length > 1024) {
    throw new WorkflowError("Please provide a name, valid email, and a password of at least 12 characters.");
  }
  return { name, email, password };
}
