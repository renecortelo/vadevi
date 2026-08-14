import { lazy, type ReactNode, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router";

import type { FirebaseUser } from "./auth/firebase";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { InfoPage } from "./pages/InfoPage";
import { InvitationAcceptPage } from "./pages/InvitationPage";
import { NewSpacePage } from "./pages/NewSpacePage";
import { SpaceSettingsPage } from "./pages/SpaceSettingsPage";
import { SessionBoundary } from "./session/SessionProvider";
import { OfflineSyncProvider } from "./offline/OfflineSyncProvider";

const DeepTastingPage = lazy(() =>
  import("./pages/DeepTastingPage").then((module) => ({ default: module.DeepTastingPage })),
);
const IdentifyPage = lazy(() =>
  import("./pages/IdentifyPage").then((module) => ({ default: module.IdentifyPage })),
);
const DataRightsPage = lazy(() =>
  import("./pages/DataRightsPage").then((module) => ({ default: module.DataRightsPage })),
);
const CellarPage = lazy(() =>
  import("./pages/CellarPage").then((module) => ({ default: module.CellarPage })),
);
const AssistantPage = lazy(() =>
  import("./pages/AssistantPage").then((module) => ({ default: module.AssistantPage })),
);
const NewSessionPage = lazy(() =>
  import("./pages/NewSessionPage").then((module) => ({ default: module.NewSessionPage })),
);
const QuickLogPage = lazy(() =>
  import("./pages/QuickLogPage").then((module) => ({ default: module.QuickLogPage })),
);
const SessionDetailPage = lazy(() =>
  import("./pages/SessionDetailPage").then((module) => ({ default: module.SessionDetailPage })),
);
const SessionsPage = lazy(() =>
  import("./pages/SessionsPage").then((module) => ({ default: module.SessionsPage })),
);
const WineMemoryPage = lazy(() =>
  import("./pages/WineMemoryPage").then((module) => ({ default: module.WineMemoryPage })),
);
const WineEvidencePage = lazy(() =>
  import("./pages/WineEvidencePage").then((module) => ({ default: module.WineEvidencePage })),
);
const ShopPage = lazy(() =>
  import("./pages/ShopPage").then((module) => ({ default: module.ShopPage })),
);
const WishlistPage = lazy(() =>
  import("./pages/WishlistPage").then((module) => ({ default: module.WishlistPage })),
);

function DeferredPage({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Suspense
      fallback={
        <section aria-live="polite" className="empty-state">
          <h1>{t("auth.loadingTitle")}</h1>
          <p>{t("auth.loadingBody")}</p>
        </section>
      }
    >
      {children}
    </Suspense>
  );
}

export function AuthenticatedRoutes() {
  return (
    <>
      <Routes>
        <Route element={<InvitationAcceptPage />} path="invitations/:token" />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route
            element={
              <DeferredPage>
                <QuickLogPage />
              </DeferredPage>
            }
            path="log/new"
          />
          <Route
            element={
              <DeferredPage>
                <IdentifyPage />
              </DeferredPage>
            }
            path="log/identify"
          />
          <Route
            element={
              <DeferredPage>
                <SessionsPage />
              </DeferredPage>
            }
            path="sessions"
          />
          <Route
            element={
              <DeferredPage>
                <NewSessionPage />
              </DeferredPage>
            }
            path="sessions/new"
          />
          <Route
            element={
              <DeferredPage>
                <SessionDetailPage />
              </DeferredPage>
            }
            path="sessions/:sessionId"
          />
          <Route
            element={
              <DeferredPage>
                <DeepTastingPage />
              </DeferredPage>
            }
            path="wines/:wineId/taste"
          />
          <Route
            element={
              <DeferredPage>
                <WineMemoryPage />
              </DeferredPage>
            }
            path="memory"
          />
          <Route
            element={
              <DeferredPage>
                <CellarPage />
              </DeferredPage>
            }
            path="cellar"
          />
          <Route
            element={
              <DeferredPage>
                <WishlistPage />
              </DeferredPage>
            }
            path="wishlist"
          />
          <Route
            element={
              <DeferredPage>
                <ShopPage />
              </DeferredPage>
            }
            path="shop"
          />
          <Route
            element={
              <DeferredPage>
                <WineEvidencePage />
              </DeferredPage>
            }
            path="wines/:wineId/evidence"
          />
          <Route
            element={
              <DeferredPage>
                <AssistantPage />
              </DeferredPage>
            }
            path="vicenc"
          />
          <Route element={<SpaceSettingsPage />} path="spaces" />
          <Route
            element={
              <DeferredPage>
                <DataRightsPage />
              </DeferredPage>
            }
            path="settings/data"
          />
          <Route element={<NewSpacePage />} path="spaces/new" />
          <Route
            element={<InfoPage bodyKey="pages.notFoundBody" titleKey="pages.notFoundTitle" />}
            path="*"
          />
        </Route>
      </Routes>
    </>
  );
}

/**
 * The whole authenticated subtree, loaded on demand.
 *
 * Keeping this behind a dynamic import moves the session provider, the offline
 * queue, and Dexie out of the initial route graph. A signed-out visitor loads
 * only the sign-in screen, which is what the §18.4 budget measures.
 */
export function AuthenticatedApp({
  signOut,
  user,
}: {
  signOut: () => Promise<void>;
  user: FirebaseUser;
}) {
  return (
    <SessionBoundary signOut={signOut} user={user}>
      <OfflineSyncProvider>
        <AuthenticatedRoutes />
      </OfflineSyncProvider>
    </SessionBoundary>
  );
}
