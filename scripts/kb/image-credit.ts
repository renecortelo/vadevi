/**
 * A photograph's author as a person would write the credit.
 *
 * Commons' "Artist" field is often a note to its editors rather than a name:
 * "No machine-readable author provided. X~commonswiki assumed (based on
 * copyright claims).", "Original uploader was X at nl.wikipedia", or a
 * request that begins "Please note: This photo can be reproduced. Please
 * quote the source as indicated below:". The name inside is kept, and so is
 * any wording the author asked to be credited with; only the note around it
 * goes.
 */
export function creditName(artist: string): string {
  let name = artist.trim();
  const assumed = /No machine-readable author provided\.\s*(.+?)~commonswiki assumed/i.exec(name);
  if (assumed) return assumed[1]!.trim();
  const uploader = /Original uploader was (.+?) at ([a-z-]+\.wikipedia)/i.exec(name);
  if (uploader) return `${uploader[1]!.trim()} (${uploader[2]})`;
  name = name.replace(/^Please note:.*?Please quote the source as indicated below:\s*/i, "");
  // Gallica's catalogue order: "Vermorel, Victor (1848-1927). Éditeur
  // scientifique Viala, Pierre (1859-1936). Directeur de publication".
  const catalogue = [
    ...name.matchAll(/([\p{Lu}][\p{L}-]+), ([\p{Lu}][\p{L}-]+) \(\d{4}-\d{4}\)/gu),
  ];
  if (catalogue.length > 1) return catalogue.map((match) => `${match[2]} ${match[1]}`).join(", ");
  return name;
}
