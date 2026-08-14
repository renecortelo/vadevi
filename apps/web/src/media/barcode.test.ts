import { describe, expect, it } from "vitest";

import { hasValidCheckDigit, isBarcodeScanningSupported, scanFrame } from "./barcode";

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
  it("reports unsupported rather than throwing where BarcodeDetector is missing", async () => {
    // Node has no BarcodeDetector, which is the same situation as Safari.
    expect(isBarcodeScanningSupported()).toBe(false);
    const outcome = await scanFrame({} as CanvasImageSource);
    // The caller must be able to offer manual entry instead of looking broken.
    expect(outcome).toEqual({ kind: "unsupported" });
  });
});
