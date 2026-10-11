import type { RegionDesignation } from "@vadevi/contracts";

/**
 * The catalog key that names a designation: the EU's PDO and PGI, or the
 * American Viticultural Area — in full, or as the short label a list shows.
 */
export function designationKey(type: RegionDesignation, short = false): string {
  const key = type === "PDO" ? "library.pdo" : type === "PGI" ? "library.pgi" : "library.ava";
  return short ? `${key}Short` : key;
}

/** Whether the name is held by the EU register, or by another country's own. */
export const inEuRegister = (type: RegionDesignation): boolean => type === "PDO" || type === "PGI";
