import { getMediaStorageConfig } from "./media-storage-config";
import { validateBillingConfig } from "./stripe";

export function validateRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  for (const key of ["MONGODB_URI", "MONGODB_DB", "ENCRYPTION_SECRET", "APP_URL", "WORKER_SECRET"]) {
    const value = env[key]?.trim();
    if (!value || /YOUR-CLUSTER|YOUR-DOMAIN|USERNAME:PASSWORD|some_ultra_secret|replace[-_ ]?me/i.test(value)) throw new Error(`${key} must be configured with a real deployment value.`);
  }
  if (!/^mongodb(\+srv)?:\/\//.test(env.MONGODB_URI!)) throw new Error("MONGODB_URI must be a MongoDB connection string.");
  if (env.ENCRYPTION_SECRET!.length < 32 || env.WORKER_SECRET!.length < 32) throw new Error("ENCRYPTION_SECRET and WORKER_SECRET must contain at least 32 characters each.");
  if (env.ENCRYPTION_SECRET === env.WORKER_SECRET) throw new Error("Use different secrets for encryption and worker authentication.");
  const url = new URL(env.APP_URL!);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(loopback && url.protocol === "http:"))) throw new Error("APP_URL must be an HTTPS origin (HTTP is allowed only on loopback for local testing).");
  getMediaStorageConfig(env);
  if (env.SMTP_URL && (!env.MAIL_FROM || !["smtp:", "smtps:"].includes(new URL(env.SMTP_URL).protocol))) throw new Error("Configure a valid SMTP_URL and MAIL_FROM together.");
  const pushKeys = [env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY, env.VAPID_SUBJECT];
  if (pushKeys.some(Boolean) && !pushKeys.every(Boolean)) throw new Error("Configure all VAPID values together, or leave all empty.");
  validateBillingConfig(env);
}
