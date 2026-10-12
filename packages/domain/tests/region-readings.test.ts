import { describe, expect, it } from "vitest";

import { regionReadings } from "../src";

describe("regionReadings", () => {
  it("reads an English valley as the Spanish one", () => {
    expect(regionReadings("maipo valley")).toEqual(["valle del maipo", "valle de maipo"]);
  });

  it("offers nothing for a name written otherwise", () => {
    expect(regionReadings("rioja")).toEqual([]);
    expect(regionReadings("valle del maipo")).toEqual([]);
  });
});
