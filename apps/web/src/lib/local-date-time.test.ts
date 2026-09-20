import { describe, expect, it } from "vitest";

import { fromLocalDateTimeInput, toLocalDateTimeInput } from "./local-date-time";

describe("a datetime-local field", () => {
  it("round-trips an instant through local wall-clock time", () => {
    const iso = "2026-08-14T19:30:00.000Z";
    const local = toLocalDateTimeInput(iso);
    expect(local).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(fromLocalDateTimeInput(local)).toBe(iso);
  });

  it("answers null — never throws — for a cleared or half-typed field", () => {
    // The change handler used to call toISOString() on Invalid Date here and
    // take the whole screen down with a RangeError.
    for (const value of ["", "2026-08", "2026-08-14T", "not a date", "2026-13-45T99:99"]) {
      expect(fromLocalDateTimeInput(value)).toBeNull();
    }
  });

  it("shows an empty field for an instant it cannot read", () => {
    expect(toLocalDateTimeInput("garbage")).toBe("");
  });
});
