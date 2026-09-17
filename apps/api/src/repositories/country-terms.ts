import { normalizeWineText } from "./wine-memory";

/**
 * A small gazetteer of country names, so a reader can ask for "something from
 * México" and reach a wine whose region reads "Parras" but whose country is
 * recorded as MX. The reader types a name; the cellar stores an ISO code — this
 * bridges the two without inventing anything, because it only ever adds the
 * reader's own wines that already carry the matching country.
 *
 * Scope is deliberately the wine-producing world rather than every nation: a
 * name that resolves to nothing here simply falls back to the ordinary
 * name/producer/region search. Each entry lists the forms the eight supported
 * locales use plus common endonyms; matching is accent- and case-insensitive
 * through `normalizeWineText`, so only spelling differences need listing.
 */
const countryNamesByCode: Readonly<Record<string, readonly string[]>> = {
  AR: ["argentina", "argentine", "argentinien", "argentinie"],
  AT: ["austria", "autriche", "osterreich", "oostenrijk"],
  AU: ["australia", "australie", "australien"],
  BG: ["bulgaria", "bulgarie", "bulgarien", "bulgarije"],
  BR: ["brazil", "brasil", "bresil", "brasilien", "brazilie", "brasile"],
  CA: ["canada", "kanada"],
  CH: ["switzerland", "suiza", "suissa", "suisse", "schweiz", "zwitserland", "svizzera", "suica"],
  CL: ["chile", "chili", "cile"],
  CN: ["china", "chine", "cina"],
  CZ: [
    "czechia",
    "czech republic",
    "republica checa",
    "tchequie",
    "tschechien",
    "tsjechie",
    "repubblica ceca",
  ],
  DE: [
    "germany",
    "alemania",
    "alemanya",
    "allemagne",
    "deutschland",
    "duitsland",
    "germania",
    "alemanha",
  ],
  ES: ["spain", "espana", "espanya", "espagne", "spanien", "spanje", "spagna", "espanha"],
  FR: ["france", "francia", "frankreich", "frankrijk", "franca"],
  GB: [
    "england",
    "inglaterra",
    "angleterre",
    "engeland",
    "inghilterra",
    "united kingdom",
    "reino unido",
    "royaume uni",
    "verenigd koninkrijk",
    "regno unito",
    "great britain",
  ],
  GE: ["georgia", "georgie", "georgien"],
  GR: ["greece", "grecia", "grece", "griechenland", "griekenland"],
  HR: ["croatia", "croacia", "croatie", "kroatien", "kroatie", "croazia"],
  HU: ["hungary", "hungria", "hongrie", "ungarn", "hongarije", "ungheria"],
  IL: ["israel", "israele"],
  IN: ["india", "inde", "indien"],
  IT: ["italy", "italia", "italie", "italien"],
  JP: ["japan", "japon", "giappone", "japao"],
  LB: ["lebanon", "libano", "liban", "libanon"],
  MD: ["moldova", "moldavia", "moldavie", "moldawien"],
  MX: ["mexico", "mexique", "mexiko", "messico"],
  NL: [
    "netherlands",
    "paises bajos",
    "holanda",
    "pays bas",
    "niederlande",
    "nederland",
    "paesi bassi",
    "holland",
  ],
  NZ: [
    "new zealand",
    "nueva zelanda",
    "nova zelandia",
    "nouvelle zelande",
    "neuseeland",
    "nieuw zeeland",
    "nuova zelanda",
  ],
  PE: ["peru", "perou"],
  PT: ["portugal"],
  RO: ["romania", "roumanie", "rumanien", "roemenie"],
  RS: ["serbia", "serbie", "serbien", "servie"],
  SI: ["slovenia", "eslovenia", "slovenie", "slowenien", "slovenija"],
  SK: ["slovakia", "eslovaquia", "slovaquie", "slowakei", "slowakije", "slovacchia"],
  TR: ["turkey", "turquia", "turquie", "turkei", "turkije", "turchia", "turkiye"],
  UA: ["ukraine", "ucrania", "ucraina", "oekraine"],
  US: [
    "united states",
    "estados unidos",
    "etats unis",
    "vereinigte staaten",
    "verenigde staten",
    "stati uniti",
  ],
  UY: ["uruguay"],
  ZA: ["south africa", "sudafrica", "afrique du sud", "sudafrika", "zuid afrika", "africa do sul"],
} as const;

// Precomputed phrase → code, normalized the same way the message will be so the
// comparison is exact. Very short forms are dropped to avoid matching a stray
// syllable inside an unrelated word.
const phraseToCode = new Map<string, string>();
for (const [code, names] of Object.entries(countryNamesByCode)) {
  for (const name of names) {
    const normalized = normalizeWineText(name);
    if (normalized.length >= 4 && !phraseToCode.has(normalized)) {
      phraseToCode.set(normalized, code);
    }
  }
}

/**
 * The ISO alpha-2 codes named in a question, most a reader would ever mean at
 * once being few. Matching is whole-phrase against the normalized message, so
 * "estados unidos" resolves even though neither word alone is a country, and a
 * substring like "chile" inside "chilena" does not (the words differ once
 * normalized and space-delimited).
 */
export function resolveCountryCodes(message: string, limit = 3): string[] {
  const normalized = normalizeWineText(message);
  if (normalized.length === 0) return [];
  const padded = ` ${normalized} `;
  const found: string[] = [];
  const seen = new Set<string>();
  for (const [phrase, code] of phraseToCode) {
    if (seen.has(code)) continue;
    if (padded.includes(` ${phrase} `)) {
      seen.add(code);
      found.push(code);
      if (found.length >= limit) break;
    }
  }
  return found;
}
