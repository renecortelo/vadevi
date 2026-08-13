import { Route, Routes } from "react-router";

import { useAuth } from "./auth/AuthContext";
import { AuthProvider } from "./auth/AuthProvider";
import { AppShell } from "./components/AppShell";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { HomePage } from "./pages/HomePage";
import { InfoPage } from "./pages/InfoPage";
import { InvitationAcceptPage, InvitationSignInPage } from "./pages/InvitationPage";
import { NewSpacePage } from "./pages/NewSpacePage";
import { QuickLogPage } from "./pages/QuickLogPage";
import { SessionStatusPage } from "./pages/SessionStatusPage";
import { SignInPage } from "./pages/SignInPage";
import { SpaceSettingsPage } from "./pages/SpaceSettingsPage";
import { WineMemoryPage } from "./pages/WineMemoryPage";
import { SessionBoundary } from "./session/SessionProvider";
import { OfflineSyncProvider } from "./offline/OfflineSyncProvider";

export function AuthenticatedRoutes() {
  return (
    <>
      <Routes>
        <Route element={<InvitationAcceptPage />} path="invitations/:token" />
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route element={<QuickLogPage />} path="log/new" />
          <Route
            element={<InfoPage bodyKey="pages.sessionsBody" titleKey="pages.sessionsTitle" />}
            path="sessions"
          />
          <Route element={<WineMemoryPage />} path="memory" />
          <Route
            element={<InfoPage bodyKey="pages.assistantBody" titleKey="pages.assistantTitle" />}
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
