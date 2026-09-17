import { describe, expect, it } from "vitest";

import { parsePastedPoint } from "./coordinates";

describe("a point pasted into the venue field", () => {
  it("reads what Google Maps puts on the clipboard", () => {
    expect(parsePastedPoint("41.385123, 2.173404")).toEqual({
      latitude: 41.385123,
      longitude: 2.173404,
    });
  });

  it("reads a full Google Maps URL from its map centre", () => {
    expect(
      parsePastedPoint("https://www.google.com/maps/place/PetNat/@41.3851,2.1734,17z/data=!3m1"),
    ).toEqual({ latitude: 41.3851, longitude: 2.1734 });
  });

  it("reads a link that carries the point as a query instead", () => {
    expect(parsePastedPoint("https://maps.google.com/?q=41.3851,2.1734")).toEqual({
      latitude: 41.3851,
      longitude: 2.1734,
    });
  });

  it("reads degrees, minutes and seconds, including the southern hemisphere", () => {
    const point = parsePastedPoint("33°51'54.5\"S 151°12'55.9\"E");
    expect(point?.latitude).toBeCloseTo(-33.865139, 4);
    expect(point?.longitude).toBeCloseTo(151.215528, 4);
  });

  it("reads a pair written with commas as decimal marks", () => {
    expect(parsePastedPoint("41,385123 2,173404")).toEqual({
      latitude: 41.385123,
      longitude: 2.173404,
    });
  });

  it("refuses a shortened Maps link rather than half-handling it", () => {
    // Resolving one means asking Google, which this deliberately never does.
    expect(parsePastedPoint("https://maps.app.goo.gl/AbCdEf123")).toBeNull();
  });

  it("leaves an ordinary venue name alone", () => {
    for (const name of ["PetNat", "Bar 40", "Casa 21, Barcelona", "El 33", ""]) {
      expect(parsePastedPoint(name)).toBeNull();
    }
  });

  it("rejects a pair that is out of range or the null island", () => {
    expect(parsePastedPoint("91.0, 2.0")).toBeNull();
    expect(parsePastedPoint("41.0, 181.0")).toBeNull();
    // 0,0 is in the Atlantic and is what a half-parsed value looks like.
    expect(parsePastedPoint("0, 0")).toBeNull();
  });

  it("rounds to the precision the geocoder itself returns", () => {
    expect(parsePastedPoint("41.38512345678, 2.17340987654")).toEqual({
      latitude: 41.385123,
      longitude: 2.17341,
    });
  });
});
