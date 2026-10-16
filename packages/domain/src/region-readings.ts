/**
 * Other ways a region name may be written, to be read as a registered name
 * that is written otherwise. Chile's decree names its valleys in Spanish
 * ("Valle del Maipo") and allows no translation of them, but export labels
 * and English articles write "Maipo Valley": the same name, in the order and
 * the word English uses. These are readings, tried only when the name as
 * written is not itself registered — never names the register gives.
 *
 * The name is expected lower-cased and without accents ("maipo valley").
 */
export function regionReadings(normalized: string): string[] {
  const valley = /^(.+) valley$/.exec(normalized);
  if (valley !== null) return [`valle del ${valley[1]}`, `valle de ${valley[1]}`];
  // Mexico's declarations name the wines of a region, not the region: the
  // IMPI protects "Vinos de la Región Vitivinícola de Querétaro", and a label
  // or the reader writes "Querétaro".
  if (normalized.length === 0 || normalized.startsWith("vinos de ")) return [];
  return [`vinos de la region vitivinicola de ${normalized}`];
}
