/**
 * A place in a list ordered by several columns, opaque to the client: the
 * values of the last row of a page. A page's query takes it as a row value
 * compared against those same columns.
 */
export function encodeListCursor(values: readonly (number | string)[]): string {
  return btoa(unescape(encodeURIComponent(values.join("\n"))))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
}

/** The values of a cursor, or null when it is not one with that many. */
export function decodeListCursor(cursor: string, length: number): string[] | null {
  try {
    const padded = cursor
      .replaceAll("-", "+")
      .replaceAll("_", "/")
      .padEnd(Math.ceil(cursor.length / 4) * 4, "=");
    const values = decodeURIComponent(escape(atob(padded))).split("\n");
    return values.length === length ? values : null;
  } catch {
    return null;
  }
}
