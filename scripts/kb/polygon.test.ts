import { describe, expect, it } from "vitest";

import { insideRing, interiorPoint, type Ring } from "./polygon";

const square: Ring = [
  [0, 0],
  [4, 0],
  [4, 4],
  [0, 4],
  [0, 0],
];
// A U, open to the north: its centroid falls in the gap between the arms.
const horseshoe: Ring = [
  [0, 0],
  [6, 0],
  [6, 6],
  [4, 6],
  [4, 2],
  [2, 2],
  [2, 6],
  [0, 6],
  [0, 0],
];

describe("interiorPoint", () => {
  it("is the centroid of a convex area", () => {
    expect(interiorPoint([square])).toEqual({ latitude: 2, longitude: 2 });
  });

  it("stays inside an area whose centroid lies outside it", () => {
    const point = interiorPoint([horseshoe])!;
    expect(insideRing(horseshoe, point.longitude, point.latitude)).toBe(true);
  });

  it("takes the largest of several rings", () => {
    const islet: Ring = [
      [10, 10],
      [10.1, 10],
      [10.1, 10.1],
      [10, 10.1],
      [10, 10],
    ];
    expect(interiorPoint([islet, square])).toEqual({ latitude: 2, longitude: 2 });
  });

  it("gives nothing for no area", () => {
    expect(interiorPoint([])).toBeNull();
  });
});
