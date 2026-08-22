import type { ExternalSourceCandidate, ProposedFact } from "@vadevi/domain";

import { normalizeWineText } from "./wine-memory";

/**
 * A curated, offline slice of eAmbrosia — the EU's official register of protected
 * wine names — mapping a well-known appellation to the country it lies in and its
 * protection category (PDO/PGI). These are regulatory facts, so they carry the
 * place dimension of "Investigate this wine" that Wikidata did badly. Nothing is
 * fetched and no dataset is redistributed: the facts are authored and cited to
 * the public register, which is where they are authoritatively recorded.
 *
 * Kept as [appellation, country, category] tuples. A wine's region is matched
 * against these as whole phrases; an unlisted region simply yields no eAmbrosia
 * fact and the ordinary flow continues.
 */
type Category = "PDO" | "PGI";

const appellations: readonly (readonly [string, string, Category])[] = [
  // Spain (Denominación de Origen / DOCa are PDO)
  ["rioja", "Spain", "PDO"],
  ["ribera del duero", "Spain", "PDO"],
  ["priorat", "Spain", "PDO"],
  ["rias baixas", "Spain", "PDO"],
  ["rueda", "Spain", "PDO"],
  ["jerez", "Spain", "PDO"],
  ["sherry", "Spain", "PDO"],
  ["cava", "Spain", "PDO"],
  ["penedes", "Spain", "PDO"],
  ["toro", "Spain", "PDO"],
  ["bierzo", "Spain", "PDO"],
  ["la mancha", "Spain", "PDO"],
  ["jumilla", "Spain", "PDO"],
  ["navarra", "Spain", "PDO"],
  ["somontano", "Spain", "PDO"],
  ["montsant", "Spain", "PDO"],
  ["valdeorras", "Spain", "PDO"],
  ["ribeira sacra", "Spain", "PDO"],
  ["utiel requena", "Spain", "PDO"],
  ["carinena", "Spain", "PDO"],
  ["calatayud", "Spain", "PDO"],
  // France (AOC/AOP are PDO)
  ["bordeaux", "France", "PDO"],
  ["bourgogne", "France", "PDO"],
  ["burgundy", "France", "PDO"],
  ["champagne", "France", "PDO"],
  ["chablis", "France", "PDO"],
  ["chateauneuf du pape", "France", "PDO"],
  ["cotes du rhone", "France", "PDO"],
  ["sancerre", "France", "PDO"],
  ["beaujolais", "France", "PDO"],
  ["alsace", "France", "PDO"],
  ["saint emilion", "France", "PDO"],
  ["pauillac", "France", "PDO"],
  ["margaux", "France", "PDO"],
  ["pomerol", "France", "PDO"],
  ["sauternes", "France", "PDO"],
  ["hermitage", "France", "PDO"],
  ["gigondas", "France", "PDO"],
  ["vouvray", "France", "PDO"],
  ["chinon", "France", "PDO"],
  ["muscadet", "France", "PDO"],
  ["cahors", "France", "PDO"],
  ["madiran", "France", "PDO"],
  // Italy (DOC/DOCG are PDO)
  ["chianti", "Italy", "PDO"],
  ["barolo", "Italy", "PDO"],
  ["barbaresco", "Italy", "PDO"],
  ["prosecco", "Italy", "PDO"],
  ["brunello di montalcino", "Italy", "PDO"],
  ["montalcino", "Italy", "PDO"],
  ["valpolicella", "Italy", "PDO"],
  ["amarone", "Italy", "PDO"],
  ["soave", "Italy", "PDO"],
  ["etna", "Italy", "PDO"],
  ["taurasi", "Italy", "PDO"],
  ["gavi", "Italy", "PDO"],
  ["franciacorta", "Italy", "PDO"],
  ["bardolino", "Italy", "PDO"],
  ["montepulciano d abruzzo", "Italy", "PDO"],
  ["salice salentino", "Italy", "PDO"],
  // Portugal
  ["douro", "Portugal", "PDO"],
  ["porto", "Portugal", "PDO"],
  ["vinho do porto", "Portugal", "PDO"],
  ["alentejo", "Portugal", "PDO"],
  ["vinho verde", "Portugal", "PDO"],
  ["dao", "Portugal", "PDO"],
  ["madeira", "Portugal", "PDO"],
  ["bairrada", "Portugal", "PDO"],
  // Germany
  ["mosel", "Germany", "PDO"],
  ["rheingau", "Germany", "PDO"],
  ["pfalz", "Germany", "PDO"],
  ["rheinhessen", "Germany", "PDO"],
  ["nahe", "Germany", "PDO"],
  ["baden", "Germany", "PDO"],
  // Austria
  ["wachau", "Austria", "PDO"],
  ["kamptal", "Austria", "PDO"],
  ["kremstal", "Austria", "PDO"],
  ["burgenland", "Austria", "PDO"],
  // Greece
  ["nemea", "Greece", "PDO"],
  ["santorini", "Greece", "PDO"],
  ["naoussa", "Greece", "PDO"],
];

// Longest phrases first, so "ribera del duero" wins over a stray "duero".
const normalizedAppellations = appellations
  .map(([name, country, category]) => ({ category, country, phrase: normalizeWineText(name) }))
  .filter((entry) => entry.phrase.length >= 3)
  .sort((left, right) => right.phrase.length - left.phrase.length);

const categoryLabel: Record<Category, string> = {
  PDO: "Protected Designation of Origin (PDO)",
  PGI: "Protected Geographical Indication (PGI)",
};

const eambrosiaSource = (retrievedAt: string, appellation: string): ExternalSourceCandidate => ({
  canonicalUrl: "https://ec.europa.eu/agriculture/eambrosia/geographical-indications-register/",
  licenseIdentifier: "CC-BY-4.0",
  publisher: "eAmbrosia (European Commission)",
  retrievedAt,
  sourceType: "open_dataset",
  title: `eAmbrosia — ${appellation}`,
});

/**
 * The regulatory country and protection category for a wine's region, drawn from
 * the curated eAmbrosia slice, or an empty list when the region names no listed
 * appellation. Higher confidence than a Wikidata label, since it is regulatory.
 */
export function resolveAppellationFacts(
  regionText: string | null,
  retrievedAt: string,
): ProposedFact[] {
  const region = normalizeWineText(regionText ?? "");
  if (region.length < 3) return [];
  const padded = ` ${region} `;
  const match = normalizedAppellations.find(
    (entry) => region === entry.phrase || padded.includes(` ${entry.phrase} `),
  );
  if (match === undefined) return [];
  const source = eambrosiaSource(retrievedAt, match.phrase);
  return [
    {
      confidenceMilli: 950,
      predicate: "region.country",
      researchMethod: "eambrosia.register.v1",
      source,
      value: match.country,
    },
    {
      confidenceMilli: 950,
      predicate: "region.classification",
      researchMethod: "eambrosia.register.v1",
      source,
      value: categoryLabel[match.category],
    },
  ];
}
