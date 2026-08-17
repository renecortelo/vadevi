import en from "@vadevi/i18n/locales/en/common.json";
import { resolveSupportedLocale, type SupportedLocale } from "@vadevi/i18n/runtime";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

type CatalogModule = { default: typeof en };

const catalogLoaders: Record<Exclude<SupportedLocale, "en">, () => Promise<CatalogModule>> = {
  ca: () => import("@vadevi/i18n/locales/ca/common.json"),
  de: () => import("@vadevi/i18n/locales/de/common.json"),
  es: () => import("@vadevi/i18n/locales/es/common.json"),
  fr: () => import("@vadevi/i18n/locales/fr/common.json"),
  it: () => import("@vadevi/i18n/locales/it/common.json"),
  nl: () => import("@vadevi/i18n/locales/nl/common.json"),
  "pt-PT": () => import("@vadevi/i18n/locales/pt-PT/common.json"),
};

/**
 * Where a signed-out choice is kept.
 *
 * The account is the source of truth once someone is in, but before that there
 * is no account — and the sign-in screen is exactly where a person who cannot
 * read the interface needs to change it. This remembers their choice until they
 * are in, and the account preference takes over from there.
 */
export const signedOutLocaleKey = "vadevi.locale";

function storedLocale(): SupportedLocale | null {
  try {
    const stored = globalThis.localStorage?.getItem(signedOutLocaleKey);
    return stored === null || stored === undefined ? null : resolveSupportedLocale(stored);
  } catch {
    // A browser that refuses storage simply follows the browser's own language.
    return null;
  }
}

export function rememberSignedOutLocale(locale: SupportedLocale): void {
  try {
    globalThis.localStorage?.setItem(signedOutLocaleKey, locale);
  } catch {
    // The choice still applies this session; only the memory of it is lost.
  }
}

const initialLocale = storedLocale() ?? resolveSupportedLocale(globalThis.navigator?.language);

await i18n.use(initReactI18next).init({
  resources: { en: { common: en } },
  lng: "en",
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
});

export async function changeLanguage(locale: SupportedLocale): Promise<void> {
  if (!i18n.hasResourceBundle(locale, "common")) {
    const catalog = locale === "en" ? en : (await catalogLoaders[locale]()).default;
    i18n.addResourceBundle(locale, "common", catalog, true, true);
  }
  await i18n.changeLanguage(locale);
}

await changeLanguage(initialLocale);

export { i18n };
