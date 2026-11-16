import { cache } from "react";
import { cookies } from "next/headers";
import { languageTools } from "./config";
import { LOCALE_COOKIE, resolveLocale } from "./locale";

export const getRequestLocale = cache(async () =>
  resolveLocale((await cookies()).get(LOCALE_COOKIE)?.value));

export async function getServerI18n() {
  return languageTools(await getRequestLocale());
}
