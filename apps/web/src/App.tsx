import { lazy, type ReactNode, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router";

import { useAuth } from "./auth/AuthContext";
import { AuthProvider } from "./auth/AuthProvider";
import { AppShell } from "./components/AppShell";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { HomePage } from "./pages/HomePage";
import { InfoPage } from "./pages/InfoPage";
import { InvitationAcceptPage, InvitationSignInPage } from "./pages/InvitationPage";
import { NewSpacePage } from "./pages/NewSpacePage";
import { SessionStatusPage } from "./pages/SessionStatusPage";
import { SignInPage } from "./pages/SignInPage";
import { SpaceSettingsPage } from "./pages/SpaceSettingsPage";
import { SessionBoundary } from "./session/SessionProvider";
import { OfflineSyncProvider } from "./offline/OfflineSyncProvider";

const DeepTastingPage = lazy(() =>
  import("./pages/DeepTastingPage").then((module) => ({ default: module.DeepTastingPage })),
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
          <Route element={<NewSpacePage />} path="spaces/new" />
          <Route
            element={<InfoPage bodyKey="pages.notFoundBody" titleKey="pages.notFoundTitle" />}
            path="*"
          />
        </Route>
      </Routes>
      <PwaUpdatePrompt />
    </>
  );
}

function SignedOutRoutes() {
  return (
    <Routes>
      <Route element={<InvitationSignInPage />} path="invitations/:token" />
      <Route element={<SignInPage />} path="*" />
    </Routes>
  );
}

function AuthGate() {
  const auth = useAuth();

  if (auth.status === "loading") {
    return <SessionStatusPage bodyKey="auth.loadingBody" titleKey="auth.loadingTitle" />;
  }

  if (auth.status === "error") {
    return (
      <SessionStatusPage
        action={() => globalThis.location.reload()}
        actionKey="auth.retry"
        bodyKey="auth.authErrorBody"
        titleKey="auth.authErrorTitle"
      />
    );
  }

  if (auth.status === "signed-out" || auth.user === null) {
    return <SignedOutRoutes />;
  }

  return (
    <SessionBoundary signOut={auth.signOut} user={auth.user}>
      <OfflineSyncProvider>
        <AuthenticatedRoutes />
      </OfflineSyncProvider>
    </SessionBoundary>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
    </AuthProvider>
  );
}
