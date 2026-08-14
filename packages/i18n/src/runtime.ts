export * from "./ontology";

export const supportedLocales = ["ca", "es", "fr", "en", "it", "pt-PT", "nl", "de"] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

export function resolveSupportedLocale(language: string | undefined): SupportedLocale {
  if (language === "pt" || language?.toLowerCase().startsWith("pt-")) {
    return "pt-PT";
  }

  const base = language?.split("-")[0]?.toLowerCase();
  return supportedLocales.find((locale) => locale === base) ?? "en";
}
