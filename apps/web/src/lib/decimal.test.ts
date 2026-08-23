import { describe, expect, it } from "vitest";

import { parseDecimalInput } from "./decimal";

describe("reading a typed decimal", () => {
  it("accepts either separator, because the keyboard decides which one", () => {
    expect(parseDecimalInput("12,5")).toBe(12.5);
    expect(parseDecimalInput("12.5")).toBe(12.5);
    expect(parseDecimalInput(" 13,05 ")).toBe(13.05);
    expect(parseDecimalInput("14")).toBe(14);
    expect(parseDecimalInput("-1,5")).toBe(-1.5);
  });

  it("returns null rather than guessing at something unusable", () => {
    expect(parseDecimalInput("")).toBeNull();
    expect(parseDecimalInput("   ")).toBeNull();
    expect(parseDecimalInput("abc")).toBeNull();
  });

  it("reads a half-typed decimal as the number so far", () => {
    // Mid-typing "12,5" the value passes through "12," — that is 12 for now, and
    // the field keeps showing the comma, so the decimals still have somewhere to
    // go. Treating it as unusable would drop what had already been typed.
    expect(parseDecimalInput("12,")).toBe(12);
    expect(parseDecimalInput("12.")).toBe(12);
  });
});
