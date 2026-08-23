import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AssistantTurnResponse, Fact } from "@vadevi/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter, Route, Routes } from "react-router";
import { beforeAll, describe, expect, it } from "vitest";

import { AuthenticatedRoutes } from "./AuthenticatedApp";
import { AuthContext, type AuthContextValue } from "./auth/AuthContext";
import type { FirebaseUser } from "./auth/firebase";
import { AppShell } from "./components/AppShell";
import { i18n } from "./i18n";
import { OfflineSyncContext, type OfflineSyncContextValue } from "./offline/OfflineSyncContext";
import { DeepTastingPage } from "./pages/DeepTastingPage";
import { AssistantPage, AssistantResult } from "./pages/AssistantPage";
import { CellarPage } from "./pages/CellarPage";
import { NewSessionPage } from "./pages/NewSessionPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { QuickLogPage } from "./pages/QuickLogPage";
import { SessionsPage } from "./pages/SessionsPage";
import { ShopPage } from "./pages/ShopPage";
import { WineMemoryPage } from "./pages/WineMemoryPage";
import { WishlistPage } from "./pages/WishlistPage";
import { FactCard, WineEvidencePage } from "./pages/WineEvidencePage";
import { SessionContext, type SessionContextValue } from "./session/SessionContext";

beforeAll(async () => {
  await i18n.changeLanguage("en");
});

const session: SessionContextValue = {
  acceptInvitation: async () => session.bootstrap,
  bootstrap: {
    data: {
      features: {
        assistant: true,
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
        displayName: "Sample Taster",
        id: "01J00000000000000000000003",
        onboardingComplete: true,
        preferredLocale: "en",
        preferredTheme: "system",
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
          displayName: "Sample Taster",
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
  refresh: async () => undefined,
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

function renderShellRoute(node: ReactNode, route: string, path: string): string {
  return renderWithSession(
    <Routes>
      <Route element={<AppShell />}>
        <Route element={node} path={path} />
      </Route>
    </Routes>,
    route,
  );
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
    const markup = renderShellRoute(<WineMemoryPage />, "/memory", "memory");

    expect(markup).toContain("Wine Memory");
    expect(markup).toMatch(/<a[^>]*aria-current="page"[^>]*href="\/memory"/);
    expect(markup).toContain("Search the bottles and opinions that belong to this Space");
    expect(markup).toContain("Cards");
    expect(markup).toContain("Table");
    expect(markup).toContain("Timeline");
    expect(markup).toContain("Sessions");
  });

  it("offers every supported locale in resumable onboarding", () => {
    const markup = renderWithSession(<OnboardingPage />);

    expect(markup).toContain('for="display-name"');
    expect(markup).toContain('value="Sample Taster"');
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
    const markup = renderWithSession(<QuickLogPage />, "/log/new");

    expect(markup).toContain('for="producer-name"');
    expect(markup).toContain('for="wine-name"');
    expect(markup).toContain('type="file"');
    expect(markup).toContain("Add a quick tasting note");
    expect(markup).toContain("Draft saved on this device");
    expect(markup).toContain("Review wine");
  });

  it("renders offline-ready session creation and the private session index", () => {
    const indexMarkup = renderWithSession(<SessionsPage />, "/sessions");
    const newMarkup = renderWithSession(<NewSessionPage />, "/sessions/new");

    expect(indexMarkup).toContain("Tasting sessions");
    expect(indexMarkup).toContain('href="/sessions/new"');
    expect(newMarkup).toContain('id="session-name"');
    expect(newMarkup).toContain('type="datetime-local"');
    expect(newMarkup).toContain("replayed exactly once");
  });

  it("renders the progressive localized deep-tasting form", () => {
    const markup = renderShellRoute(
      <DeepTastingPage />,
      "/wines/01J00000000000000000000004/taste",
      "wines/:wineId/taste",
    );

    expect(markup).toContain("Deep tasting");
    expect(markup).toContain('aria-label="Tasting sections"');
    expect(markup).toContain("Appearance");
    expect(markup).toContain("Memory cues");
    expect(markup).toContain("Save draft");
  });

  it("renders a localized evidence route with explicit provenance states", () => {
    const markup = renderShellRoute(
      <WineEvidencePage />,
      "/wines/01J00000000000000000000004/evidence",
      "wines/:wineId/evidence",
    );

    expect(markup).toContain("Wine evidence");
    expect(markup).toContain("Back to Wine Memory");
    expect(markup).toContain("Loading the evidence");
    expect(markup).toContain("observed, researched, inferred, or personal");
    expect(markup).toContain("External research is disabled in this deployment");
  });

  it("renders the Vicenç chat composer and its on-device note", () => {
    const markup = renderShellRoute(<AssistantPage />, "/vicenc", "vicenc");

    expect(markup).toContain("Vicenç Vinyes");
    expect(markup).toContain('id="assistant-message"');
    expect(markup).toContain("Searching the active Space only");
    expect(markup).toContain("stays only on this device");
  });

  it("renders the Phase 5 cellar, wishlist, and sourced-price routes", () => {
    const cellar = renderShellRoute(<CellarPage />, "/cellar", "cellar");
    const wishlist = renderShellRoute(<WishlistPage />, "/wishlist", "wishlist");
    const shop = renderShellRoute(<ShopPage />, "/shop", "shop");

    expect(cellar).toContain("Inventory is always derived");
    expect(cellar).toContain("Record purchase and bottles");
    expect(wishlist).toContain("Why do you want it?");
    expect(wishlist).toContain("Target price in EUR");
    expect(shop).toContain("Source type");
    expect(shop).toContain("External coverage is optional");
  });

  it("renders deterministic assistant results with an explicit sample basis", () => {
    const response: AssistantTurnResponse = {
      data: {
        citations: [],
        comparisons: [],
        evidence: [
          {
            evidenceClass: "observed",
            label: "1 matching Wine Memory record",
            sampleSize: 1,
            sourceIds: [],
          },
        ],
        mode: "deterministic",
        priceObservations: [],
        recommendations: [],
        renderedClaims: [],
        renderedText:
          "I found 1 matching wine in your authorized Wine Memory. AI is off, so this is a direct structured search—not a generated answer.",
        results: [
          {
            spaceId: "01J00000000000000000000001",
            spaceName: "Personal space",
            wine: {
              appellation: null,
              countryCode: "ES",
              createdAt: "2026-08-13T20:00:00.000Z",
              displayName: "Synthetic Coastal White",
              id: "01J00000000000000000000004",
              identityStatus: "confirmed",
              lastTastedAt: null,
              mediaId: null,
              nonVintage: false,
              noteCount: 1,
              producerName: "Synthetic Cellar",
              region: "Test Region",
              score100: null,
              version: 1,
              vintageYear: 2024,
              wineType: "white",
            },
          },
        ],
        tasteProfile: null,
        threadId: null,
        toolAvailability: {
          ai: "disabled",
          buildRecommendation: "available",
          compareWines: "available",
          createActionDraft: "available",
          externalResearch: "disabled",
          findPriceObservations: "available",
          getTasteProfile: "available",
          getWineContext: "available",
          researchWine: "disabled",
          searchMemory: "available",
        },
        turnId: "01J00000000000000000000007",
        usage: {
          externalResearchCalls: 0,
          maxExternalResearchCalls: 2,
          maxToolCalls: 6,
          toolCalls: 1,
        },
        warnings: ["ai_disabled", "deterministic_search"],
        wineContext: null,
      },
    };

    const markup = renderWithSession(<AssistantResult response={response} />);

    // The answer reads as prose, and the wine it found is shown — without the
    // developer-facing mode, evidence-class, or tool-availability scaffolding.
    expect(markup).toContain("I found 1 matching wine");
    expect(markup).toContain("Synthetic Coastal White");
    expect(markup).not.toContain("Structured search");
    expect(markup).not.toContain("AI provider disabled");
  });

  it("keeps a fact clean while tucking attribution and license behind a source toggle", () => {
    const fact: Fact = {
      citations: [
        {
          locator: "Technical sheet, p. 2",
          source: {
            canonicalUrl: "https://producer.example.test/technical-sheet",
            createdAt: "2026-08-13T20:00:00.000Z",
            createdByProvider: "synthetic-test-provider",
            createdByUserId: null,
            id: "01J00000000000000000000005",
            licenseIdentifier: "CC-BY-4.0",
            publisher: "Synthetic Producer",
            retrievedAt: "2026-08-13T20:00:00.000Z",
            sourceType: "producer",
            title: "Synthetic technical sheet",
            updatedAt: "2026-08-13T20:00:00.000Z",
          },
          supportStrength: "direct",
        },
      ],
      confidenceMilli: 900,
      createdAt: "2026-08-13T20:00:00.000Z",
      evidenceClass: "researched",
      id: "01J00000000000000000000006",
      observedByUserId: null,
      predicate: "production.aging_months",
      researchMethod: "synthetic.test.v1",
      status: "disputed",
      subjectId: "01J00000000000000000000004",
      subjectType: "wine",
      updatedAt: "2026-08-13T20:00:00.000Z",
      value: 12,
      verifiedAt: null,
      verifiedByUserId: null,
      version: 2,
    };

    const markup = renderWithSession(
      <FactCard fact={fact} onReject={() => undefined} rejecting={false} />,
    );

    expect(markup).toContain("Researched");
    expect(markup).toContain("Disputed");
    expect(markup).toContain("12 months");
    // Provenance still ships, but behind the collapsed "Source" toggle.
    expect(markup).toContain("Source");
    expect(markup).toContain("Synthetic technical sheet");
    expect(markup).toContain("License CC-BY-4.0");
    expect(markup).toContain("Technical sheet, p. 2");
    expect(markup).toContain('id="fact-value-01J00000000000000000000006"');
  });

  it("renders a discovered highlight as a clean key/value pair", () => {
    const fact: Fact = {
      citations: [
        {
          locator: null,
          source: {
            canonicalUrl: "https://www.wikidata.org/wiki/Q123",
            createdAt: "2026-08-13T20:00:00.000Z",
            createdByProvider: "synthetic-test-provider",
            createdByUserId: null,
            id: "01J00000000000000000000007",
            licenseIdentifier: "CC0-1.0",
            publisher: "Wikidata",
            retrievedAt: "2026-08-13T20:00:00.000Z",
            sourceType: "open_dataset",
            title: "Synthetic Estate",
            updatedAt: "2026-08-13T20:00:00.000Z",
          },
          supportStrength: "supporting",
        },
      ],
      confidenceMilli: 800,
      createdAt: "2026-08-13T20:00:00.000Z",
      evidenceClass: "researched",
      id: "01J00000000000000000000008",
      observedByUserId: null,
      predicate: "curiosity.highlight",
      researchMethod: "wikidata.highlight.v1",
      status: "proposed",
      subjectId: "01J00000000000000000000004",
      subjectType: "wine",
      updatedAt: "2026-08-13T20:00:00.000Z",
      value: "Founded: 1870",
      verifiedAt: null,
      verifiedByUserId: null,
      version: 1,
    };

    const markup = renderWithSession(
      <FactCard fact={fact} onReject={() => undefined} rejecting={false} />,
    );

    expect(markup).toContain('data-highlight="true"');
    expect(markup).toContain("fact-card__key");
    expect(markup).toContain("Founded");
    expect(markup).toContain("1870");
  });
});
