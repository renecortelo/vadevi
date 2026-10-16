import { describe, expect, it } from "vitest";

import { regionReadings } from "../src";

describe("regionReadings", () => {
  it("reads an English valley as the Spanish one", () => {
    expect(regionReadings("maipo valley")).toEqual(["valle del maipo", "valle de maipo"]);
  });

  it("reads a Mexican region as the wines its declaration protects", () => {
    expect(regionReadings("queretaro")).toEqual(["vinos de la region vitivinicola de queretaro"]);
    expect(regionReadings("vinos de la region vitivinicola de queretaro")).toEqual([]);
  });

  it("offers only the declared form for any other name", () => {
    expect(regionReadings("valle del maipo")).toEqual([
      "vinos de la region vitivinicola de valle del maipo",
    ]);
    expect(regionReadings("")).toEqual([]);
  });
});
