/**
 * A list of values in one bound parameter.
 *
 * D1 allows 100 bound parameters per statement. A query that spells a list
 * out as `IN (?, ?, ?, …)` spends one parameter per element, so the contract's
 * own limits — 100 wines on a page, 200 photographs in an archive — were
 * enough to make the statement fail outright, with the fixed parameters
 * around the list pushing it past the limit exactly at the maximum the
 * contract permits. `json_each` reads the whole list from a single JSON
 * parameter instead, so the count of parameters no longer depends on the
 * data, and the list can be as long as the contract allows.
 */
export function jsonList(values: readonly (number | string)[]): {
  /** `IN (…)` and `NOT IN (…)` take this as their right-hand side. */
  readonly bind: string;
  readonly sql: "(SELECT value FROM json_each(?))";
} {
  return { bind: JSON.stringify(values), sql: "(SELECT value FROM json_each(?))" };
}
