import { describe, expect, it } from "vitest";

import { resolve } from "node:path";

import figures from "virtual:library-figures";

import { libraryFigures } from "../../library-figures";

/** The reel's figures are the library's own, counted from its files. */
describe("the library's figures", () => {
  it("are counted from data/kb and the catalogs, not written by hand", () => {
    const counted = libraryFigures(resolve(import.meta.dirname, "../../../.."));
    expect(figures).toEqual(counted);
    expect(counted.languages).toBe(8);
    expect(counted.names).toBeGreaterThan(2000);
    expect(counted.grapes).toBeGreaterThan(100);
  });
});
