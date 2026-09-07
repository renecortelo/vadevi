/**
 * A point the reader pasted in.
 *
 * OpenStreetMap knows the places somebody mapped; Google Maps knows almost every
 * business. When a bar is in one and not the other, the reader can still record
 * where they were: in Google Maps, right-click the place and copy its
 * coordinates, then paste them here.
 *
 * This is deliberately just string parsing. Nothing is fetched, no API is called,
 * and no map provider's content is stored — two numbers are a geographic fact,
 * and the reader supplies them by hand. A full Google Maps URL is accepted too,
 * because it carries the same numbers after an `@`, but a shortened link
 * (`maps.app.goo.gl/…`) cannot be resolved without asking Google, so it is
 * rejected rather than half-handled.
 */
export type PastedPoint = Readonly<{ latitude: number; longitude: number }>;

/** Six decimals is about 0.1 m, and matches what the geocoder returns. */
function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function point(latitude: number, longitude: number): PastedPoint | null {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  // 0,0 is in the Atlantic and is what an empty or half-parsed value looks like.
  if (latitude === 0 && longitude === 0) return null;
  return { latitude: round(latitude), longitude: round(longitude) };
}

/** "41°23'6.4\"N 2°10'6.7\"E" — the degrees-minutes-seconds Maps also offers. */
function fromDegreesMinutesSeconds(value: string): PastedPoint | null {
  const pattern =
    /(\d+(?:\.\d+)?)\s*°\s*(\d+(?:\.\d+)?)?\s*['′]?\s*(\d+(?:\.\d+)?)?\s*["″]?\s*([NSEW])/giu;
  const found: Array<{ degrees: number; hemisphere: string }> = [];
  for (const match of value.matchAll(pattern)) {
    const degrees = Number(match[1]) + Number(match[2] ?? 0) / 60 + Number(match[3] ?? 0) / 3_600;
    found.push({ degrees, hemisphere: match[4]!.toUpperCase() });
    if (found.length === 2) break;
  }
  if (found.length !== 2) return null;
  const north = found.find((entry) => entry.hemisphere === "N" || entry.hemisphere === "S");
  const east = found.find((entry) => entry.hemisphere === "E" || entry.hemisphere === "W");
  if (north === undefined || east === undefined) return null;
  return point(
    north.hemisphere === "S" ? -north.degrees : north.degrees,
    east.hemisphere === "W" ? -east.degrees : east.degrees,
  );
}

/**
 * The point in whatever the reader pasted, or null when there is none.
 *
 * Null is the ordinary case, not an error: almost everything typed into a venue
 * field is a name. The caller treats a hit as a point and everything else as
 * text, so a bar actually called "40 20" is still a name — it has no separator
 * and no second number to make a pair.
 */
export function parsePastedPoint(input: string): PastedPoint | null {
  const value = input.trim();
  if (value.length === 0 || value.length > 2_000) return null;

  // A shortened Maps link carries no coordinates at all; resolving it would mean
  // asking Google, which this deliberately does not do.
  if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(value)) return null;

  // A full Google Maps URL: the map centre follows an "@".
  const at = /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(value);
  if (at !== null) return point(Number(at[1]), Number(at[2]));

  // Some links carry it as a query instead — ?q=lat,lng or ?query=lat,lng.
  const query = /[?&](?:q|query|ll|daddr)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/.exec(value);
  if (query !== null) return point(Number(query[1]), Number(query[2]));

  // A bare pair, which is what "copy coordinates" puts on the clipboard. Both
  // separators are accepted: some locales copy "41,3851 2,1734" with commas as
  // decimal marks, so a space-separated pair is read that way when the
  // comma-separated reading would not give two numbers.
  const plain = /^(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)$/.exec(value);
  if (plain !== null) {
    return point(Number(plain[1]!.replace(",", ".")), Number(plain[2]!.replace(",", ".")));
  }
  const spaced = /^(-?\d+(?:[.,]\d+)?)\s+(-?\d+(?:[.,]\d+)?)$/.exec(value);
  if (spaced !== null) {
    return point(Number(spaced[1]!.replace(",", ".")), Number(spaced[2]!.replace(",", ".")));
  }

  return fromDegreesMinutesSeconds(value);
}
