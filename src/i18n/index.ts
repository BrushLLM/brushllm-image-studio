import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ja from "./locales/ja.json";
import de from "./locales/de.json";
import ko from "./locales/ko.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import es from "./locales/es.json";
import ptBR from "./locales/pt-BR.json";
import fr from "./locales/fr.json";

// System first, then languages sorted by their native name (the common
// convention in OS language lists): Latin scripts alphabetically, then
// CJK by code point.
export const LANGUAGES = [
  { value: "system", label: "System" },
  { value: "de", label: "Deutsch" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "pt-BR", label: "Português (BR)" },
  { value: "ja", label: "日本語" },
  { value: "zh-CN", label: "简体中文" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "ko", label: "한국어" },
] as const;

export type Language = (typeof LANGUAGES)[number]["value"];

/** Resolve the "system" preference to a concrete UI language. */
export function resolveLanguage(pref: string): string {
  if (pref !== "system") return pref;
  const nav = typeof navigator !== "undefined" ? navigator.language : "en";
  if (nav.startsWith("zh")) return /TW|HK|Hant/i.test(navigator.language) ? "zh-TW" : "zh-CN";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("de")) return "de";
  if (nav.startsWith("ko")) return "ko";
  if (nav.startsWith("es")) return "es";
  if (nav.startsWith("fr")) return "fr";
  if (nav.startsWith("pt")) return "pt-BR";
  return "en";
}

export async function initI18n(language: string) {
  await i18next.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      ja: { translation: ja },
      de: { translation: de },
      ko: { translation: ko },
      "zh-CN": { translation: zhCN },
      "zh-TW": { translation: zhTW },
      es: { translation: es },
      "pt-BR": { translation: ptBR },
      fr: { translation: fr },
    },
    lng: resolveLanguage(language),
    fallbackLng: "en",
    interpolation: { escapeValue: false },
  });
  return i18next;
}

export default i18next;
