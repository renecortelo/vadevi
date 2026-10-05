import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { i18n } from "../i18n";
import { trailFrom } from "./trail";
import { TrailBackLink } from "./TrailBackLink";

describe("the way back out of the library", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("leads back to the wine the reader came from", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter
        initialEntries={[
          {
            pathname: "/library/grapes/tempranillo",
            state: trailFrom("Viña Tondonia", "/wines/w1/evidence"),
          },
        ]}
      >
        <TrailBackLink />
      </MemoryRouter>,
    );
    expect(markup).toContain('href="/wines/w1/evidence"');
    expect(markup).toContain("Back to Viña Tondonia");
  });

  it("shows nothing when the library was opened on its own", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/library/grapes/tempranillo"]}>
        <TrailBackLink />
      </MemoryRouter>,
    );
    expect(markup).toBe("");
  });
});
