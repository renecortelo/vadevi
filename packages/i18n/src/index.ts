import ca from "./locales/ca/common.json";
import de from "./locales/de/common.json";
import en from "./locales/en/common.json";
import es from "./locales/es/common.json";
import fr from "./locales/fr/common.json";
import it from "./locales/it/common.json";
import nl from "./locales/nl/common.json";
import ptPT from "./locales/pt-PT/common.json";

export * from "./runtime";

export const resources = {
  ca: { common: ca },
  de: { common: de },
  en: { common: en },
  es: { common: es },
  fr: { common: fr },
  it: { common: it },
  nl: { common: nl },
  "pt-PT": { common: ptPT },
} as const;
