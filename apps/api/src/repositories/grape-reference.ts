import type { LibraryGrape } from "@vadevi/contracts";

import { findGrapesByName, getLibraryGrape } from "./library";

/**
 * What a wine's grapes are typically like, from the wine library — the
 * reference a tasting is set against when the producer has said nothing.
 *
 * A wine records its grapes as the reader wrote them ("Garnatxa", "Samsó");
 * each is found in the library by any of its names and read in English, the
 * language the model's material is assembled in. The line says plainly that
 * it describes the variety in general, never this bottle: a Garnacha is
 * typically low in acidity, which says nothing certain about the one poured.
 */
export type GrapeReference = {
  card: LibraryGrape;
  /** The articles the values come from — English, and the grape's own language's. */
  sourceUrls: string[];
  /** The profile as one English sentence, or null when the card has none. */
  text: string | null;
};

export async function grapeReferencesFor(
  database: D1Database,
  grapeNames: readonly string[],
): Promise<GrapeReference[]> {
  const references: GrapeReference[] = [];
  const seen = new Set<string>();
  for (const name of grapeNames.slice(0, 4)) {
    const [id] = await findGrapesByName(database, name, 1);
    if (id === undefined || seen.has(id)) continue;
    seen.add(id);
    const card = await getLibraryGrape(database, id, "en");
    if (card === null) continue;
    const profileFields = ["acidity", "tannin", "body", "aromas", "pairings", "color"];
    const sourceUrls = [
      ...new Set(
        card.evidence
          .filter((entry) => profileFields.includes(entry.field))
          .map((entry) => entry.sourceUrl),
      ),
    ];
    const fallback = card.evidence[0]?.sourceUrl ?? card.summary?.sourceUrl;
    if (sourceUrls.length === 0 && fallback !== undefined) sourceUrls.push(fallback);
    if (sourceUrls.length === 0) continue;
    references.push({ card, sourceUrls, text: profileLine(card, name) });
  }
  return references;
}

function profileLine(card: LibraryGrape, recordedAs: string): string | null {
  const parts = [
    card.color === null
      ? null
      : `${card.color === "pink" ? "grey/pink-skinned" : card.color} grape`,
    card.acidity === null ? null : `acidity typically ${card.acidity}`,
    card.tannin === null ? null : `tannin typically ${card.tannin}`,
    card.body === null ? null : `body typically ${card.body}`,
    card.aromas.length === 0
      ? null
      : `typical aromas and flavours: ${card.aromas.slice(0, 10).join(", ")}`,
    card.pairings.length === 0 ? null : `said to suit: ${card.pairings.slice(0, 6).join(", ")}`,
    card.suggestedPairings === null
      ? null
      : `the pairing rules suggest: ${card.suggestedPairings.families
          .slice(0, 6)
          .map((family) => family.replaceAll("_", " "))
          .join(", ")}`,
  ].filter((part): part is string => part !== null);
  // A colour alone is no profile to compare a tasting with.
  if (parts.length < 2) return null;
  const named =
    card.name.toLowerCase() === recordedAs.toLowerCase()
      ? card.name
      : `${card.name} (recorded as ${recordedAs})`;
  return `${named}, as the variety typically is — general to the grape, not a description of this wine: ${parts.join("; ")}`;
}
