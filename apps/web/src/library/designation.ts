import type { RegionDesignation } from "@vadevi/contracts";

/**
 * The catalog key that names a designation: the EU's PDO and PGI, the
 * American Viticultural Area, New Zealand's geographical indication, South
 * Africa's Wine of Origin — in full, or as the short label a list shows.
 */
export function designationKey(type: RegionDesignation, short = false): string {
  const key = `library.${type.toLowerCase()}`;
  return short ? `${key}Short` : key;
}

/**
 * The suffix of the catalog keys that speak of a name's register: none for
 * the EU's, the country's for its own ("Us", "Au", "Cl", "Nz", "Za") — New Zealand
 * and Australia both call theirs a geographical indication.
 */
export function registerSuffix(
  type: RegionDesignation,
  countryCode: string,
): "" | "Au" | "Cl" | "Nz" | "Us" | "Za" {
  if (inEuRegister(type)) return "";
  const suffixes: Record<string, "Au" | "Cl" | "Nz" | "Us" | "Za"> = {
    AU: "Au",
    CL: "Cl",
    NZ: "Nz",
    US: "Us",
    ZA: "Za",
  };
  return suffixes[countryCode] ?? "";
}

/** Whether the name is held by the EU register, or by another country's own. */
export const inEuRegister = (type: RegionDesignation): boolean => type === "PDO" || type === "PGI";
