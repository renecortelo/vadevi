import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { MapLink } from "./MapLink";

/**
 * The link out to a map. Two things matter: that it prefers the point over the
 * name, since two bars share a name and no two share a coordinate, and that it
 * says nothing at all when there is no place to open.
 */
describe("the map link", () => {
  it("uses the coordinates when there is a point", () => {
    const html = renderToStaticMarkup(
      <MapLink latitude={41.385123} longitude={2.1734} name="Can Pau" />,
    );
    expect(html).toContain("query=41.385123%2C2.1734");
    expect(html).not.toContain("Can%20Pau");
  });

  it("falls back to the name when the place was only ever typed", () => {
    const html = renderToStaticMarkup(<MapLink name="La terraza de Marta" />);
    expect(html).toContain("query=La%20terraza%20de%20Marta");
  });

  it("renders nothing when there is neither a point nor a name", () => {
    expect(renderToStaticMarkup(<MapLink latitude={null} longitude={null} name="" />)).toBe("");
    expect(renderToStaticMarkup(<MapLink />)).toBe("");
  });

  it("renders nothing for half a point and no name", () => {
    // A lone latitude is not a place; without a name there is nothing to open.
    expect(renderToStaticMarkup(<MapLink latitude={41.385} name="" />)).toBe("");
  });

  it("does not hand this application's URL to the map", () => {
    const html = renderToStaticMarkup(<MapLink latitude={41.385} longitude={2.173} />);
    expect(html).toContain("noreferrer");
    expect(html).toContain('target="_blank"');
  });
});
