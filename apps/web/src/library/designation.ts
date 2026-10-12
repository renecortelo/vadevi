import type { LibraryRegion, RegionDesignation } from "@vadevi/contracts";

/**
 * The catalog key that names a designation: the EU's and the UK's PDO and
 * PGI, the American Viticultural Area, New Zealand's and Australia's
 * geographical indications, South Africa's Wine of Origin, Chile's
 * denomination of origin, Argentina's IG and DOC — in full, or as the short
 * label a list shows.
 */
export function designationKey(type: RegionDesignation, short = false): string {
  const key = `library.${type.toLowerCase()}`;
  return short ? `${key}Short` : key;
}

type RegisterSuffix = "" | "Ar" | "Au" | "Cl" | "Gb" | "Nz" | "Us" | "Za";

/**
 * The suffix of the catalog keys that speak of a name's register: none for
 * the EU's, the country's for its own ("Us", "Au", "Cl", "Nz", "Za", "Ar",
 * "Gb") — New Zealand and Australia both call theirs a geographical
 * indication, and the UK its names PDO and PGI as the EU does.
 */
export function registerSuffix(
  region: Pick<LibraryRegion, "countryCode" | "eambrosiaId">,
): RegisterSuffix {
  if (inEuRegister(region)) return "";
  const suffixes: Record<string, RegisterSuffix> = {
    AR: "Ar",
    AU: "Au",
    CL: "Cl",
    GB: "Gb",
    NZ: "Nz",
    US: "Us",
    ZA: "Za",
  };
  return suffixes[region.countryCode] ?? "";
}

/** Whether the name is held by the EU register, or by another country's own. */
export const inEuRegister = (region: Pick<LibraryRegion, "eambrosiaId">): boolean =>
  region.eambrosiaId !== null;
