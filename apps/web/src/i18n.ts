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
 *
 * The account preference is written here too, every time the session applies
 * it. Otherwise the next cold start has nothing to go on but the browser's own
 * language until the bootstrap arrives, and the loading screen — the first thing
 * a reader sees — comes up in English or Portuguese for someone who set
 * Spanish. The theme solved the same flash the same way, in `theme-init.js`:
 * what the account decided last time is the right guess this time.
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

export function rememberLocale(locale: SupportedLocale): void {
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

// A catalogue that cannot be loaded must not stop the application from
// starting. This is a top-level await: if it rejects, the module fails, and
// nothing after it ever renders — a blank screen, for the sake of a translation.
// English is already in the bundle, so the fallback is to start in it and let
// the session apply the reader's language once the catalogue can be fetched.
try {
  await changeLanguage(initialLocale);
} catch {
  await i18n.changeLanguage("en");
}

export { i18n };
