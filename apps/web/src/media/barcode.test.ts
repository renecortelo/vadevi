import { describe, expect, it } from "vitest";

import { hasValidCheckDigit, needsDecoderDownload } from "./barcode";

describe("barcode check digits", () => {
  it("accepts real EAN-13 and EAN-8 codes", () => {
    // Check digits computed from the published EAN algorithm.
    expect(hasValidCheckDigit("4006381333931")).toBe(true);
    expect(hasValidCheckDigit("96385074")).toBe(true);
  });

  it("rejects a transposed or mistyped digit", () => {
    expect(hasValidCheckDigit("4006381333932")).toBe(false);
    expect(hasValidCheckDigit("96385075")).toBe(false);
  });

  it("rejects anything that is not a plausible barcode", () => {
    for (const value of ["", "12345", "abcdefghijklm", "40063813339311111"]) {
      expect(hasValidCheckDigit(value)).toBe(false);
    }
  });
});

describe("scanner capability", () => {
  it("falls back to the decoder where the browser has no BarcodeDetector", () => {
    // Node has none, which is the same situation as Safari and therefore as
    // every browser on iOS. It used to mean no scanner at all; it now means the
    // WebAssembly decoder does the work, which is what this reports.
    expect(needsDecoderDownload()).toBe(true);
  });
});
