/**
 * Countries offered when recording or filtering a wine.
 *
 * The record stores an ISO 3166-1 alpha-2 code, which is what the API and the
 * filters compare — but nobody thinks of their bottle as being from "ES". The
 * reader picks a country by name; the code is an internal detail they never see.
 *
 * Names come from `Intl.DisplayNames`, so each locale gets its own spelling
 * without a translated list to maintain, and the options are sorted the way that
 * locale sorts. The codes are the wine-producing countries; an unlisted one can
 * still be held by a record written elsewhere, and is shown by its own name.
 */
const wineCountryCodes = [
  "AR",
  "AM",
  "AT",
  "AU",
  "BG",
  "BR",
  "CA",
  "CH",
  "CL",
  "CN",
  "CY",
  "CZ",
  "DE",
  "DZ",
  "ES",
  "FR",
  "GB",
  "GE",
  "GR",
  "HR",
  "HU",
  "IL",
  "IN",
  "IT",
  "JP",
  "LB",
  "LU",
  "MA",
  "MD",
  "ME",
  "MK",
  "MT",
  "MX",
  "NZ",
  "PE",
  "PT",
  "RO",
  "RS",
  "RU",
  "SI",
  "SK",
  "TR",
  "UA",
  "US",
  "UY",
  "ZA",
] as const;

export type CountryOption = { code: string; name: string };

/** The list to render, named in the reader's language and sorted for it. */
export function countryOptions(locale: string): CountryOption[] {
  let display: Intl.DisplayNames | null = null;
  try {
    display = new Intl.DisplayNames([locale], { type: "region" });
  } catch {
    display = null;
  }
  const options = wineCountryCodes.map((code) => ({
    code,
    name: display?.of(code) ?? code,
  }));
  try {
    return options.sort((left, right) => left.name.localeCompare(right.name, locale));
  } catch {
    return options.sort((left, right) => left.name.localeCompare(right.name));
  }
}

/** A stored code shown by name, so a record from anywhere still reads properly. */
export function countryName(code: string, locale: string): string {
  if (code.length !== 2) return code;
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/**
 * The options plus whatever the record already holds. A wine saved with a country
 * outside the list — an older record, or one written elsewhere — must not lose it
 * simply because the selector never offered it, so its code is added, by name.
 */
export function countryOptionsFor(locale: string, selected: string): CountryOption[] {
  const options = countryOptions(locale);
  const code = selected.trim().toUpperCase();
  if (code.length === 0 || options.some((option) => option.code === code)) return options;
  return [...options, { code, name: countryName(code, locale) }];
}
