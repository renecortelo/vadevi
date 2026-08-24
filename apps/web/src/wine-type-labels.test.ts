import { WineTypeSchema } from "@vadevi/contracts";
import en from "@vadevi/i18n/locales/en/common.json";
import { describe, expect, it } from "vitest";

// The wine-type selects render each enum value with t(`quickLog.wineType.<value>`).
// A value without a label ships an untranslated key like "quickLog.wineType.vermouth"
// into the dropdown — and a value the selects offer but the schema rejects fails
// the save. This ties the three together so neither can drift again.
describe("wine type labels", () => {
  const labels = (en as { quickLog: { wineType: Record<string, string> } }).quickLog.wineType;

  it("has a label for every wine type the schema allows", () => {
    for (const value of WineTypeSchema.options) {
      expect(labels[value], `missing quickLog.wineType.${value}`).toBeTruthy();
    }
  });

  it("has no label for a value the schema does not allow", () => {
    const allowed = new Set<string>(WineTypeSchema.options);
    for (const key of Object.keys(labels)) {
      expect(allowed.has(key), `stale quickLog.wineType.${key}`).toBe(true);
    }
  });
});
