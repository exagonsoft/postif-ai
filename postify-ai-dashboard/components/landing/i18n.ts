import { createI18n } from "flat-i18n";
import texts from "./texts.json";

createI18n(texts, "en");

export { texts };