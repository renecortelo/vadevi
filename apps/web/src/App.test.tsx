import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { AuthenticatedRoutes } from "./App";
import { i18n } from "./i18n";
import { OnboardingPage } from "./pages/OnboardingPage";
import { SessionContext, type SessionContextValue } from "./session/SessionContext";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const session: SessionContextValue = {
  acceptInvitation: async () => session.bootstrap,
  bootstrap: {
    data: {
      features: {
        assistant: false,
        externalResearch: false,
        priceLookup: false,
        voiceInput: false,
      },
      spaces: [
        {
          id: "01J00000000000000000000001",
          name: "Personal space",
          role: "owner",
          type: "personal",
        },
        {
          id: "01J00000000000000000000002",
          name: "Friday table",
          role: "member",
          type: "group",
        },
      ],
      user: {
        activeSpaceId: "01J00000000000000000000001",
        displayName: "René",
        id: "01J00000000000000000000003",
        onboardingComplete: true,
        preferredLocale: "en",
      },
      versions: {
        api: "1",
        i18nCatalog: "2026.1",
        tastingOntology: "2026.1",
      },
    },
  },
  createInvitation: async () => {
    throw new Error("Not used by this render test.");
  },
  createSpace: async () => {
    throw new Error("Not used by this render test.");
  },
  getSpace: async () => ({
    data: {
      members: [
        {
          displayName: "René",
          id: "01J00000000000000000000003",
          joinedAt: "2026-08-13T00:00:00.000Z",
          role: "owner",
          version: 1,
        },
      ],
      space: {
        defaultLocale: "en",
        id: "01J00000000000000000000001",
        name: "Personal space",
        role: "owner",
        type: "personal",
        version: 1,
      },
    },
  }),
  isUpdating: false,
  removeMember: async () => {
    throw new Error("Not used by this render test.");
  },
  signOut: async () => undefined,
  updateProfile: async () => session.bootstrap,
};

function renderWithSession(node: ReactNode, route = "/"): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <SessionContext.Provider value={session}>{node}</SessionContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function renderRoute(route: string): string {
  return renderWithSession(<AuthenticatedRoutes />, route);
}

describe("authenticated app shell", () => {
  it("renders named primary navigation and the active Space", () => {
    const markup = renderRoute("/");

    expect(markup).toContain('<nav aria-label="Primary"');
    expect(markup).toContain('<label class="sr-only" for="active-space">Active Space</label>');
    expect(markup).toContain("Personal space");
    expect(markup).toContain("Friday table");
    expect(markup).toContain("A place for every bottle worth remembering.");
  });

  it("keeps each core route inside the same shell and marks it active", () => {
    const markup = renderRoute("/memory");

    expect(markup).toContain("Wine Memory");
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/memory"/);
    expect(markup).toContain("Your private cards, table, timeline, filters, and export");
  });

  it("offers every supported locale in resumable onboarding", () => {
    const markup = renderWithSession(<OnboardingPage />);

    expect(markup).toContain('for="display-name"');
    expect(markup).toContain('value="René"');
    expect(markup).toContain("Català");
    expect(markup).toContain("Português");
    expect(markup.match(/<option/g)).toHaveLength(8);
  });

  it("renders an accessible couple/group Space creation form", () => {
    const markup = renderRoute("/spaces/new");

    expect(markup).toContain("Create a Space.");
    expect(markup).toContain('<fieldset class="choice-fieldset">');
    expect(markup).toContain('name="space-type"');
    expect(markup).toContain('for="space-name"');
    expect(markup).toContain('for="space-locale"');
    expect(markup).toContain("A private Space designed for exactly two active members.");
  });
});
