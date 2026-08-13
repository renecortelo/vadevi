import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { AuthenticatedRoutes } from "./App";
import { AuthContext, type AuthContextValue } from "./auth/AuthContext";
import type { FirebaseUser } from "./auth/firebase";
import { i18n } from "./i18n";
import { OfflineSyncContext, type OfflineSyncContextValue } from "./offline/OfflineSyncContext";
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

const firebaseUser = {
  getIdToken: async () => "test-token",
  uid: "firebase-web-test-user",
} as FirebaseUser;

const auth: AuthContextValue = {
  appEnvironment: "local",
  error: null,
  isEmulator: true,
  signIn: async () => undefined,
  signOut: async () => undefined,
  status: "signed-in",
  user: firebaseUser,
};

const offlineSync: OfflineSyncContextValue = {
  clearOfflineData: async () => undefined,
  flush: async () => undefined,
  pendingCount: 0,
  queueDraft: async () => undefined,
  refreshStatus: async () => undefined,
  status: "synced",
};

function renderWithSession(node: ReactNode, route = "/"): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={auth}>
          <SessionContext.Provider value={session}>
            <OfflineSyncContext.Provider value={offlineSync}>{node}</OfflineSyncContext.Provider>
          </SessionContext.Provider>
        </AuthContext.Provider>
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
    expect(markup).toContain("Search the bottles and opinions that belong to this Space");
    expect(markup).toContain("Cards");
    expect(markup).toContain("Table");
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

  it("renders a manual, explicitly confirmed, offline-ready Quick Log", () => {
    const markup = renderRoute("/log/new");

    expect(markup).toContain('for="producer-name"');
    expect(markup).toContain('for="wine-name"');
    expect(markup).toContain('type="file"');
    expect(markup).toContain("Add a quick tasting note");
    expect(markup).toContain("Draft saved on this device");
    expect(markup).toContain("Review wine");
  });
});
