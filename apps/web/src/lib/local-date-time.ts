/**
 * The two directions of a `datetime-local` field.
 *
 * The field speaks civil time with no zone — "2026-08-14T21:30" — and the
 * record keeps an instant. Going out, the instant is shifted by the device's
 * offset so the field shows the local wall-clock time. Coming back, the field
 * may be empty or half-typed: `new Date("")` is Invalid Date, and calling
 * `toISOString()` on it throws a RangeError straight out of the change
 * handler — which took the whole screen down. So the way back answers null
 * for anything that is not a complete date, and the caller keeps what it had.
 */
export function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function fromLocalDateTimeInput(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
