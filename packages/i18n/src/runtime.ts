export * from "./ontology";

export const supportedLocales = ["ca", "es", "fr", "en", "it", "pt-PT", "nl", "de"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

/**
 * Endonyms: each language is named in itself, never translated.
 *
 * Someone who has landed in a language they cannot read has to recognise their
 * own from the list, and "Catalan" only helps a reader who already reads
 * English. These are the strings that make the language control an escape
 * hatch rather than another thing to be stuck inside.
 */
export const localeLabels: Record<SupportedLocale, string> = {
  ca: "Català",
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  nl: "Nederlands",
  "pt-PT": "Português",
};

export function resolveSupportedLocale(language: string | undefined): SupportedLocale {
  if (language === "pt" || language?.toLowerCase().startsWith("pt-")) {
    return "pt-PT";
  }

  const base = language?.split("-")[0]?.toLowerCase();
  return supportedLocales.find((locale) => locale === base) ?? "en";
}
