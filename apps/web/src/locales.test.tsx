import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { supportedLocales } from "@vadevi/i18n/runtime";
import { pseudoLocalizeCatalog, type Catalog } from "@vadevi/i18n/pseudo";
import sourceCatalog from "@vadevi/i18n/locales/en/common.json";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AuthContext, type AuthContextValue } from "./auth/AuthContext";
import type { FirebaseUser } from "./auth/firebase";
import { AppShell } from "./components/AppShell";
import { changeLanguage, i18n } from "./i18n";
import { OfflineSyncContext, type OfflineSyncContextValue } from "./offline/OfflineSyncContext";
import { CellarPage } from "./pages/CellarPage";
import { DataRightsPage } from "./pages/DataRightsPage";
import { HomePage } from "./pages/HomePage";
import { IdentifyPage } from "./pages/IdentifyPage";
import { QuickLogPage } from "./pages/QuickLogPage";
import { SessionsPage } from "./pages/SessionsPage";
import { WineMemoryPage } from "./pages/WineMemoryPage";
import { SessionContext, type SessionContextValue } from "./session/SessionContext";

const spaceId = "01J00000000000000000000001";

const session: SessionContextValue = {
  acceptInvitation: async () => session.bootstrap,
  bootstrap: {
    data: {
      features: { assistant: true, externalResearch: false, priceLookup: false, voiceInput: false },
      spaces: [{ id: spaceId, name: "Personal space", role: "owner", type: "personal" }],
      user: {
        activeSpaceId: spaceId,
        displayName: "Sample Taster",
        id: "01J00000000000000000000003",
        onboardingComplete: true,
        preferredLocale: "en",
      },
      versions: { api: "1", i18nCatalog: "2026.1", tastingOntology: "2026.1" },
    },
  },
  createInvitation: async () => {
    throw new Error("Not used by this render test.");
  },
  createSpace: async () => {
    throw new Error("Not used by this render test.");
  },
  getSpace: async () => {
    throw new Error("Not used by this render test.");
  },
  isUpdating: false,
  refresh: async () => undefined,
  removeMember: async () => {
    throw new Error("Not used by this render test.");
  },
  signOut: async () => undefined,
  updateProfile: async () => session.bootstrap,
};

const auth: AuthContextValue = {
  appEnvironment: "local",
  error: null,
  isEmulator: true,
  signIn: async () => undefined,
  signOut: async () => undefined,
  status: "signed-in",
  user: { getIdToken: async () => "test-token", uid: "locale-test-user" } as FirebaseUser,
};

const offlineSync: OfflineSyncContextValue = {
  clearOfflineData: async () => undefined,
  flush: async () => undefined,
  pendingCount: 0,
  queueDraft: async () => undefined,
  refreshStatus: async () => undefined,
  status: "synced",
};

function render(node: ReactNode, route: string, path: string): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <AuthContext.Provider value={auth}>
          <SessionContext.Provider value={session}>
            <OfflineSyncContext.Provider value={offlineSync}>
              <Routes>
                <Route element={<AppShell />}>
                  <Route element={node} path={path} />
                </Route>
              </Routes>
            </OfflineSyncContext.Provider>
          </SessionContext.Provider>
        </AuthContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

/** The main flow a new member walks through on first use. */
const mainFlow = [
  { node: <HomePage />, path: "", route: "/", titleKey: "welcomeTitle" },
  { node: <QuickLogPage />, path: "log/new", route: "/log/new", titleKey: "quickLog.title" },
  {
    node: <IdentifyPage />,
    path: "log/identify",
    route: "/log/identify",
    titleKey: "identify.title",
  },
  { node: <WineMemoryPage />, path: "memory", route: "/memory", titleKey: "memory.title" },
  { node: <SessionsPage />, path: "sessions", route: "/sessions", titleKey: "sessions.title" },
  { node: <CellarPage />, path: "cellar", route: "/cellar", titleKey: "cellar.title" },
  {
    node: <DataRightsPage />,
    path: "settings/data",
    route: "/settings/data",
    titleKey: "dataRights.title",
  },
] as const;

/** HTML-escape the way `renderToStaticMarkup` does, so lookups match the markup. */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#x27;");
}

/** Every source key, so a leak of a raw key into a rendered screen is visible. */
function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenKeys(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}
const sourceKeys = flattenKeys(sourceCatalog);

afterAll(async () => {
  await changeLanguage("en");
});

describe("main flow renders in every supported locale (AC-054)", () => {
  for (const locale of supportedLocales) {
    it(`renders the main flow in ${locale} without a missing-key or raw-key leak`, async () => {
      await changeLanguage(locale);
      expect(i18n.language).toBe(locale);

      for (const screen of mainFlow) {
        const markup = render(screen.node, screen.route, screen.path);

        // The screen rendered this locale's own heading, not an English fallback.
        expect(markup).toContain(escapeHtml(i18n.t(screen.titleKey)));
        // i18next echoes the key when a translation is missing.
        for (const key of sourceKeys) {
          expect(markup).not.toContain(`>${key}<`);
        }
        expect(markup).not.toContain("undefined</");
        // Interpolation must be resolved, never rendered raw.
        expect(markup).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
      }
    });
  }

  it("renders the same key set in every locale, so no screen falls back to English", async () => {
    for (const locale of supportedLocales) {
      await changeLanguage(locale);
      const bundle = i18n.getResourceBundle(locale, "common") as Catalog;
      expect(flattenKeys(bundle).sort()).toEqual(sourceKeys.sort());
    }
  });
});

describe("pseudo-localization layout probe (AC-054)", () => {
  const pseudoLocale = "pseudo";

  beforeAll(async () => {
    i18n.addResourceBundle(
      pseudoLocale,
      "common",
      pseudoLocalizeCatalog(sourceCatalog as Catalog),
      true,
      true,
    );
    await i18n.changeLanguage(pseudoLocale);
  });

  it("renders every main-flow screen with expanded, accented strings intact", () => {
    for (const screen of mainFlow) {
      const markup = render(screen.node, screen.route, screen.path);

      // The pseudo markers prove the screen resolved strings from the catalog
      // rather than rendering hard-coded or concatenated text.
      expect(markup).toContain("⟦");
      expect(markup).toContain("⟧");
      expect(markup).not.toMatch(/\{\{[a-zA-Z]+\}\}/);
    }
  });
});
