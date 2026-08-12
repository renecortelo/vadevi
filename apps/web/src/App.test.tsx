import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { i18n } from "./i18n";
import { App } from "./App";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

function renderRoute(route: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <App />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Phase 0 app shell", () => {
  it("renders named primary navigation and the active Space", () => {
    const markup = renderRoute("/");

    expect(markup).toContain('<nav aria-label="Primary"');
    expect(markup).toContain("Personal space · local preview");
    expect(markup).toContain("A place for every bottle worth remembering.");
  });

  it("keeps each core route inside the same shell and marks it active", () => {
    const markup = renderRoute("/memory");

    expect(markup).toContain("Wine Memory");
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/memory"/);
    expect(markup).toContain("Your private cards, table, timeline, filters, and export");
  });
});
