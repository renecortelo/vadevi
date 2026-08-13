import { Route, Routes } from "react-router";

import { useAuth } from "./auth/AuthContext";
import { AuthProvider } from "./auth/AuthProvider";
import { AppShell } from "./components/AppShell";
import { PwaUpdatePrompt } from "./components/PwaUpdatePrompt";
import { HomePage } from "./pages/HomePage";
import { InfoPage } from "./pages/InfoPage";
import { SessionStatusPage } from "./pages/SessionStatusPage";
import { SignInPage } from "./pages/SignInPage";
import { SessionBoundary } from "./session/SessionProvider";

export function AuthenticatedRoutes() {
  return (
    <>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<HomePage />} />
          <Route
            element={<InfoPage bodyKey="pages.logBody" titleKey="pages.logTitle" />}
            path="log/new"
          />
          <Route
            element={<InfoPage bodyKey="pages.sessionsBody" titleKey="pages.sessionsTitle" />}
            path="sessions"
          />
          <Route
            element={<InfoPage bodyKey="pages.memoryBody" titleKey="pages.memoryTitle" />}
            path="memory"
          />
          <Route
            element={<InfoPage bodyKey="pages.assistantBody" titleKey="pages.assistantTitle" />}
            path="vicenc"
          />
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
    return <SignInPage />;
  }

  return (
    <SessionBoundary signOut={auth.signOut} user={auth.user}>
      <AuthenticatedRoutes />
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
