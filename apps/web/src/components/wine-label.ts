/**
 * How a wine reads in a list, decided once.
 *
 * Its own file so the label and the components that use it can be imported
 * separately — and so the vintage cannot end up in some lists and missing
 * from others.
 */

export type PickableWine = {
  displayName: string;
  id: string;
  nonVintage?: boolean;
  producerName: string;
  vintageYear?: number | null;
};

/**
 * The vintage belongs in the label. Choosing between two bottles of the same
 * wine — and being asked afterwards whether the vintage is exact or approximate
 * — is not possible from a producer and a name alone, and the answer was a trip
 * to Wine Memory and back.
 */
export function wineOptionLabel(wine: PickableWine): string {
  const base = `${wine.producerName} · ${wine.displayName}`;
  if (wine.nonVintage === true) return `${base} · NV`;
  if (wine.vintageYear === null || wine.vintageYear === undefined) return base;
  return `${base} · '${String(wine.vintageYear).slice(-2)}`;
}
