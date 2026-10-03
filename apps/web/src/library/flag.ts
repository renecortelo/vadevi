/**
 * A country's flag as an emoji, built from its two-letter code: no image to
 * ship or fetch. Systems without flag glyphs (Windows) show the two letters
 * instead, which still reads; the country's name is always written beside it.
 */
export function flagOf(countryCode: string | null): string {
  if (countryCode === null || !/^[A-Z]{2}$/i.test(countryCode)) return "";
  return [...countryCode.toUpperCase()]
    .map((letter) => String.fromCodePoint(0x1f1e6 + letter.charCodeAt(0) - 65))
    .join("");
}
