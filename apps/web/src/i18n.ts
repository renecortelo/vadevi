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

const initialLocale = resolveSupportedLocale(globalThis.navigator?.language);

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
