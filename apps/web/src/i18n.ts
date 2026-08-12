import { resources, resolveSupportedLocale } from "@vadevi/i18n";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

void i18n.use(initReactI18next).init({
  resources,
  lng: resolveSupportedLocale(globalThis.navigator?.language),
  fallbackLng: "en",
  defaultNS: "common",
  interpolation: {
    escapeValue: false,
  },
});

export { i18n };
