import { normalizeWineText } from "./wine-memory";

/**
 * A curated subset of wine appellations and regions mapped to the country they
 * belong to — an offline slice of what a full eAmbrosia integration would give
 * (eAmbrosia is the EU's official register of protected names).
 *
 * It closes the place gap the country gazetteer alone cannot: a reader asks for
 * "algo de México" and owns a wine whose region reads "Parras" but whose country
 * was never recorded. Parras is in Mexico, so naming the country should reach it.
 * These mappings are public regulatory facts (a DOP/IGP or region lies in one
 * country), never invented, and they only ever surface the reader's own wines.
 *
 * Kept as [name, ISO alpha-2] pairs so multi-word names need no key quoting.
 * Scope is the better-known appellations across the wine world, not every one; a
 * name that is not listed simply falls back to the ordinary region search.
 */
const appellationCountry: readonly (readonly [string, string])[] = [
  // Spain
  ["rioja", "ES"],
  ["ribera del duero", "ES"],
  ["priorat", "ES"],
  ["rias baixas", "ES"],
  ["rueda", "ES"],
  ["jerez", "ES"],
  ["sherry", "ES"],
  ["manzanilla", "ES"],
  ["penedes", "ES"],
  ["cava", "ES"],
  ["toro", "ES"],
  ["bierzo", "ES"],
  ["la mancha", "ES"],
  ["valdepenas", "ES"],
  ["somontano", "ES"],
  ["ribeira sacra", "ES"],
  ["ribeiro", "ES"],
  ["monterrei", "ES"],
  ["valdeorras", "ES"],
  ["navarra", "ES"],
  ["carinena", "ES"],
  ["calatayud", "ES"],
  ["campo de borja", "ES"],
  ["jumilla", "ES"],
  ["yecla", "ES"],
  ["bullas", "ES"],
  ["utiel requena", "ES"],
  ["valencia", "ES"],
  ["alicante", "ES"],
  ["montsant", "ES"],
  ["emporda", "ES"],
  ["costers del segre", "ES"],
  ["cigales", "ES"],
  ["arribes", "ES"],
  ["txakoli", "ES"],
  ["getariako txakolina", "ES"],
  ["montilla moriles", "ES"],
  ["malaga", "ES"],
  ["condado de huelva", "ES"],
  // France
  ["bordeaux", "FR"],
  ["bourgogne", "FR"],
  ["burgundy", "FR"],
  ["champagne", "FR"],
  ["chablis", "FR"],
  ["cotes du rhone", "FR"],
  ["rhone", "FR"],
  ["beaujolais", "FR"],
  ["sancerre", "FR"],
  ["alsace", "FR"],
  ["chateauneuf du pape", "FR"],
  ["loire", "FR"],
  ["provence", "FR"],
  ["languedoc", "FR"],
  ["saint emilion", "FR"],
  ["medoc", "FR"],
  ["pauillac", "FR"],
  ["margaux", "FR"],
  ["saint julien", "FR"],
  ["saint estephe", "FR"],
  ["pomerol", "FR"],
  ["graves", "FR"],
  ["sauternes", "FR"],
  ["pessac leognan", "FR"],
  ["cotes de provence", "FR"],
  ["bandol", "FR"],
  ["cahors", "FR"],
  ["madiran", "FR"],
  ["gaillac", "FR"],
  ["jurancon", "FR"],
  ["cornas", "FR"],
  ["hermitage", "FR"],
  ["cote rotie", "FR"],
  ["condrieu", "FR"],
  ["gigondas", "FR"],
  ["vacqueyras", "FR"],
  ["tavel", "FR"],
  ["vouvray", "FR"],
  ["chinon", "FR"],
  ["bourgueil", "FR"],
  ["muscadet", "FR"],
  ["pouilly fume", "FR"],
  ["cote de nuits", "FR"],
  ["cote de beaune", "FR"],
  ["meursault", "FR"],
  ["puligny montrachet", "FR"],
  ["gevrey chambertin", "FR"],
  ["pouilly fuisse", "FR"],
  ["savoie", "FR"],
  ["cassis", "FR"],
  // Italy
  ["toscana", "IT"],
  ["tuscany", "IT"],
  ["piemonte", "IT"],
  ["piedmont", "IT"],
  ["chianti", "IT"],
  ["barolo", "IT"],
  ["barbaresco", "IT"],
  ["prosecco", "IT"],
  ["valpolicella", "IT"],
  ["amarone", "IT"],
  ["brunello di montalcino", "IT"],
  ["montalcino", "IT"],
  ["soave", "IT"],
  ["montepulciano", "IT"],
  ["franciacorta", "IT"],
  ["sicilia", "IT"],
  ["sicily", "IT"],
  ["montefalco", "IT"],
  ["gavi", "IT"],
  ["barbera d asti", "IT"],
  ["dolcetto", "IT"],
  ["langhe", "IT"],
  ["alto adige", "IT"],
  ["sudtirol", "IT"],
  ["trentino", "IT"],
  ["friuli", "IT"],
  ["collio", "IT"],
  ["lugana", "IT"],
  ["bardolino", "IT"],
  ["vino nobile di montepulciano", "IT"],
  ["montepulciano d abruzzo", "IT"],
  ["nero d avola", "IT"],
  ["etna", "IT"],
  ["taurasi", "IT"],
  ["fiano di avellino", "IT"],
  ["greco di tufo", "IT"],
  ["aglianico", "IT"],
  ["primitivo di manduria", "IT"],
  ["salice salentino", "IT"],
  ["vermentino", "IT"],
  ["cannonau di sardegna", "IT"],
  ["frascati", "IT"],
  ["orvieto", "IT"],
  // Portugal
  ["douro", "PT"],
  ["alentejo", "PT"],
  ["vinho verde", "PT"],
  ["dao", "PT"],
  ["bairrada", "PT"],
  ["madeira", "PT"],
  ["bucelas", "PT"],
  ["colares", "PT"],
  ["setubal", "PT"],
  ["lisboa", "PT"],
  ["tejo", "PT"],
  ["vinho do porto", "PT"],
  ["porto", "PT"],
  // Germany
  ["mosel", "DE"],
  ["mosel saar ruwer", "DE"],
  ["rheingau", "DE"],
  ["pfalz", "DE"],
  ["rheinhessen", "DE"],
  ["nahe", "DE"],
  ["baden", "DE"],
  ["franken", "DE"],
  ["wurttemberg", "DE"],
  ["ahr", "DE"],
  ["saale unstrut", "DE"],
  // Austria
  ["wachau", "AT"],
  ["kamptal", "AT"],
  ["burgenland", "AT"],
  ["weinviertel", "AT"],
  ["kremstal", "AT"],
  ["neusiedlersee", "AT"],
  // Greece
  ["nemea", "GR"],
  ["naoussa", "GR"],
  ["santorini", "GR"],
  ["mantinia", "GR"],
  // Hungary
  ["tokaj", "HU"],
  ["tokaji", "HU"],
  ["eger", "HU"],
  ["villany", "HU"],
  // Slovenia / Romania / Georgia
  ["primorska", "SI"],
  ["stajerska", "SI"],
  ["dealu mare", "RO"],
  ["cotnari", "RO"],
  ["kakheti", "GE"],
  // United States
  ["napa", "US"],
  ["napa valley", "US"],
  ["sonoma", "US"],
  ["willamette valley", "US"],
  ["paso robles", "US"],
  ["russian river", "US"],
  ["central coast", "US"],
  ["finger lakes", "US"],
  ["columbia valley", "US"],
  ["santa barbara", "US"],
  ["walla walla", "US"],
  // Canada
  ["okanagan valley", "CA"],
  ["niagara", "CA"],
  // Argentina
  ["mendoza", "AR"],
  ["uco valley", "AR"],
  ["valle de uco", "AR"],
  ["cafayate", "AR"],
  ["salta", "AR"],
  ["san juan", "AR"],
  ["patagonia", "AR"],
  ["rio negro", "AR"],
  // Chile
  ["maipo", "CL"],
  ["colchagua", "CL"],
  ["casablanca", "CL"],
  ["aconcagua", "CL"],
  ["limari", "CL"],
  ["elqui", "CL"],
  ["bio bio", "CL"],
  // Australia
  ["barossa", "AU"],
  ["barossa valley", "AU"],
  ["mclaren vale", "AU"],
  ["coonawarra", "AU"],
  ["yarra valley", "AU"],
  ["margaret river", "AU"],
  ["hunter valley", "AU"],
  ["adelaide hills", "AU"],
  ["clare valley", "AU"],
  ["eden valley", "AU"],
  // New Zealand
  ["marlborough", "NZ"],
  ["central otago", "NZ"],
  ["hawkes bay", "NZ"],
  // South Africa
  ["stellenbosch", "ZA"],
  ["swartland", "ZA"],
  ["paarl", "ZA"],
  ["constantia", "ZA"],
  ["franschhoek", "ZA"],
  ["walker bay", "ZA"],
  // Mexico
  ["parras", "MX"],
  ["valle de guadalupe", "MX"],
  ["baja california", "MX"],
  ["ensenada", "MX"],
];

// Normalized phrase → country, and the reverse country → phrases, both built
// once so the message scan and the country expansion are exact.
const phraseToCountry = new Map<string, string>();
const countryToPhrases = new Map<string, string[]>();
for (const [name, code] of appellationCountry) {
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
