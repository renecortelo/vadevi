import { normalizeWineText } from "./wine-memory";

/**
 * A curated subset of wine appellations and regions mapped to the country they
 * belong to — an offline slice of what a full eAmbrosia integration would give.
 *
 * It closes the place gap the country gazetteer alone cannot: a reader asks for
 * "algo de México" and owns a wine whose region reads "Parras" but whose country
 * was never recorded. Parras is in Mexico, so naming the country should reach it.
 * These mappings are public regulatory facts (a DOP/IGP or region lies in one
 * country), never invented, and they only ever surface the reader's own wines.
 *
 * Scope is the better-known appellations across the wine world, not every one; a
 * name that is not listed simply falls back to the ordinary region search.
 */
const appellationCountry: Readonly<Record<string, string>> = {
  // Spain
  rioja: "ES",
  "ribera del duero": "ES",
  priorat: "ES",
  "rias baixas": "ES",
  rueda: "ES",
  jerez: "ES",
  sherry: "ES",
  penedes: "ES",
  toro: "ES",
  bierzo: "ES",
  "la mancha": "ES",
  valdepenas: "ES",
  somontano: "ES",
  // France
  bordeaux: "FR",
  bourgogne: "FR",
  burgundy: "FR",
  champagne: "FR",
  chablis: "FR",
  "cotes du rhone": "FR",
  rhone: "FR",
  beaujolais: "FR",
  sancerre: "FR",
  alsace: "FR",
  "chateauneuf du pape": "FR",
  loire: "FR",
  provence: "FR",
  languedoc: "FR",
  "saint emilion": "FR",
  medoc: "FR",
  // Italy
  toscana: "IT",
  tuscany: "IT",
  piemonte: "IT",
  piedmont: "IT",
  chianti: "IT",
  barolo: "IT",
  barbaresco: "IT",
  prosecco: "IT",
  valpolicella: "IT",
  amarone: "IT",
  "brunello di montalcino": "IT",
  soave: "IT",
  montepulciano: "IT",
  franciacorta: "IT",
  sicilia: "IT",
  sicily: "IT",
  // Portugal
  douro: "PT",
  alentejo: "PT",
  "vinho verde": "PT",
  dao: "PT",
  bairrada: "PT",
  madeira: "PT",
  // Germany
  mosel: "DE",
  rheingau: "DE",
  pfalz: "DE",
  rheinhessen: "DE",
  nahe: "DE",
  // Austria
  wachau: "AT",
  kamptal: "AT",
  burgenland: "AT",
  // United States
  napa: "US",
  "napa valley": "US",
  sonoma: "US",
  "willamette valley": "US",
  "paso robles": "US",
  "russian river": "US",
  "central coast": "US",
  "finger lakes": "US",
  // Argentina
  mendoza: "AR",
  "uco valley": "AR",
  "valle de uco": "AR",
  cafayate: "AR",
  salta: "AR",
  // Chile
  maipo: "CL",
  colchagua: "CL",
  casablanca: "CL",
  aconcagua: "CL",
  // Australia
  barossa: "AU",
  "barossa valley": "AU",
  "mclaren vale": "AU",
  coonawarra: "AU",
  "yarra valley": "AU",
  "margaret river": "AU",
  "hunter valley": "AU",
  // New Zealand
  marlborough: "NZ",
  "central otago": "NZ",
  "hawkes bay": "NZ",
  // South Africa
  stellenbosch: "ZA",
  swartland: "ZA",
  paarl: "ZA",
  constantia: "ZA",
  // Mexico
  parras: "MX",
  "valle de guadalupe": "MX",
  "baja california": "MX",
  ensenada: "MX",
  // Hungary
  tokaj: "HU",
  tokaji: "HU",
  eger: "HU",
  // Georgia
  kakheti: "GE",
};

// Normalized phrase → country, and the reverse country → phrases, both built
// once so the message scan and the country expansion are exact.
const phraseToCountry = new Map<string, string>();
const countryToPhrases = new Map<string, string[]>();
for (const [name, code] of Object.entries(appellationCountry)) {
  const normalized = normalizeWineText(name);
  if (normalized.length < 3) continue;
  if (!phraseToCountry.has(normalized)) phraseToCountry.set(normalized, code);
  const list = countryToPhrases.get(code) ?? [];
  list.push(normalized);
  countryToPhrases.set(code, list);
}

/**
 * The ISO alpha-2 codes of any appellation or region named in a question, so
 * "algo de Rioja" also reaches wines recorded under Spain. Whole-phrase match
 * over the normalized message, exactly like the country gazetteer.
 */
export function resolveAppellationCountries(message: string, limit = 3): string[] {
  const normalized = normalizeWineText(message);
  if (normalized.length === 0) return [];
  const padded = ` ${normalized} `;
  const found: string[] = [];
  const seen = new Set<string>();
  for (const [phrase, code] of phraseToCountry) {
    if (seen.has(code)) continue;
    if (padded.includes(` ${phrase} `)) {
      seen.add(code);
      found.push(code);
      if (found.length >= limit) break;
    }
  }
  return found;
}

/**
 * The known appellation/region names for a country, so naming the country can
 * also reach a wine whose region is one of them but whose country was never
 * recorded — the Parras-in-Mexico case. Bounded, since it drives extra lookups.
 */
export function appellationsForCountry(code: string, limit = 6): string[] {
  return (countryToPhrases.get(code) ?? []).slice(0, limit);
}
