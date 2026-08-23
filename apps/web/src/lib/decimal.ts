/**
 * Reading a decimal a person typed.
 *
 * A Spanish or French keyboard offers a comma, and `<input type="number">` will
 * not even accept that character — so an alcohol percentage or a price could not
 * be given a decimal at all on a phone. These fields are therefore plain text
 * with `inputMode="decimal"`, which shows the numeric keypad without policing
 * the separator, and the value is read here instead.
 *
 * Both separators are accepted; anything that is not a number returns null so the
 * caller can leave the field unset rather than store a guess.
 */
export function parseDecimalInput(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (normalized.length === 0) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}
