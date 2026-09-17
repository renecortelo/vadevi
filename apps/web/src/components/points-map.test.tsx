import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { i18n } from "../i18n";
import { type MapPoint, PointsMap } from "./PointsMap";

/**
 * The map's points are the one control in the application that is not a button.
 *
 * They are SVG circles, and a circle announces nothing: given `role="button"`
 * and `tabIndex={0}` and nothing else, a screen reader reaches an unnamed
 * button and a keyboard reaches a focus ring that Enter does not activate. Both
 * shipped that way, because the accessibility sweep visits `/memory` in its
 * default card view and never presses the toggle that draws this.
 *
 * So the name is asserted here, close to the component, rather than waited for
 * in a browser sweep that would have to seed a tasting with coordinates first.
 */

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const points: MapPoint[] = [
  {
    latitude: 41.38,
    longitude: 2.17,
    subtitle: "Bar Pastís",
    title: "Celler Sintètic · Vinya Nord",
    wineId: "01J00000000000000000000001",
  },
  // Same hundredth of a degree as the first, so these two share one marker and
  // the label has to carry both.
  {
    latitude: 41.381,
    longitude: 2.171,
    subtitle: "Bar Pastís",
    title: "Celler Sintètic · Vinya Sud",
    wineId: "01J00000000000000000000002",
  },
  {
    latitude: 43.26,
    longitude: -2.93,
    subtitle: "Taberna Sintética",
    title: "Bodega Ficticia · Tinto",
    wineId: "01J00000000000000000000003",
  },
];

function draw(given: MapPoint[]): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <PointsMap emptyLabel="Nothing to plot yet" points={given} />
    </MemoryRouter>,
  );
}

describe("PointsMap", () => {
  it("gives every interactive point an accessible name", () => {
    const markup = draw(points);
    const dots = markup.match(/<circle[^>]*role="button"[^>]*>/g) ?? [];

    expect(dots.length).toBeGreaterThan(0);
    for (const dot of dots) {
      expect(dot).toMatch(/aria-label="[^"]+"/);
    }
  });

  it("names a shared marker after every wine standing on it", () => {
    const markup = draw(points);

    // The two Barcelona points round to the same cell, so one marker carries
    // both names; a reader who cannot see the "2" needs them from the label.
    expect(markup).toContain("Vinya Nord, Celler Sintètic · Vinya Sud");
  });

  it("says so plainly when there is nothing to plot", () => {
    expect(draw([])).toContain("Nothing to plot yet");
  });
});
