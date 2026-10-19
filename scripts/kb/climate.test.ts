import { describe, expect, it } from "vitest";

import { growingDegreeDays, koppenGeiger, summarizeClimate, winklerRegion } from "./climate";

/**
 * The rules on climates shaped like well-known wine places — monthly means
 * written for the test, close to those places' normals but not quoted from
 * any record.
 */
const oceanic = {
  pr: [87, 70, 65, 78, 73, 62, 50, 56, 74, 92, 103, 92],
  tas: [6.6, 7.4, 10.1, 12.5, 16, 19.3, 21.3, 21.4, 18.4, 14.9, 10, 7.1],
};
const andeanDesert = {
  pr: [30, 40, 30, 10, 8, 6, 7, 5, 10, 15, 20, 25],
  tas: [25, 24, 21, 17, 13, 9, 8, 10, 13, 18, 21, 24],
};
const southernMediterranean = {
  pr: [20, 15, 25, 40, 60, 80, 75, 70, 60, 45, 30, 25],
  tas: [23, 23, 21, 18, 15, 13, 12, 13, 15, 17, 20, 22],
};
const continental = {
  pr: [30, 30, 35, 45, 60, 75, 80, 70, 50, 40, 40, 35],
  tas: [-4, -2, 3, 9, 15, 18, 20, 19, 14, 9, 3, -2],
};

describe("Köppen–Geiger", () => {
  it("reads an oceanic climate as Cfb", () => {
    expect(koppenGeiger(oceanic, 44.8)).toBe("Cfb");
  });

  it("reads a dry inland climate as cold desert, BWk", () => {
    expect(koppenGeiger(andeanDesert, -32.9)).toBe("BWk");
  });

  it("reads the seasons by hemisphere: dry southern summers make Csa", () => {
    expect(koppenGeiger(southernMediterranean, -34.9)).toBe("Csa");
  });

  it("reads a winter below 0 °C as continental, Dfb", () => {
    expect(koppenGeiger(continental, 48)).toBe("Dfb");
  });
});

describe("Winkler", () => {
  it("counts April to October in the north", () => {
    // (12.5-10)*30 + 6*31 + 9.3*30 + 11.3*31 + 11.4*31 + 8.4*30 + 4.9*31
    expect(growingDegreeDays(oceanic, 44.8)).toBe(1648);
    expect(winklerRegion(1648)).toBe("II");
  });

  it("counts October to April in the south", () => {
    // October–April of the southern test climate.
    expect(growingDegreeDays(southernMediterranean, -34.9)).toBe(
      Math.round(7 * 31 + 10 * 30 + 12 * 31 + 13 * 31 + 13 * 28 + 11 * 31 + 8 * 30),
    );
  });

  it("leaves a climate too cool for region I without one", () => {
    expect(winklerRegion(600)).toBeNull();
    expect(winklerRegion(2400)).toBe("V");
  });

  it("summarizes rain and mean temperature", () => {
    const summary = summarizeClimate(oceanic, 44.8);
    expect(summary.rainfall).toBe(902);
    expect(summary.meanTemperature).toBe(13.8);
    expect(summary.koppen).toBe("Cfb");
  });
});
