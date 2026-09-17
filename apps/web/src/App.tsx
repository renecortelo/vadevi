import { lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import { Route, Routes } from "react-router";

import { useAuth } from "./auth/AuthContext";
import { AuthProvider } from "./auth/AuthProvider";
import {
  InstallPrompt,
  PwaUpdatePrompt,
  StoragePressureNotice,
} from "./components/PwaUpdatePrompt";
import { InvitationSignInPage } from "./pages/InvitationPage";
import { SessionStatusPage } from "./pages/SessionStatusPage";
import { SignInPage } from "./pages/SignInPage";

const AuthenticatedApp = lazy(() =>
  import("./AuthenticatedApp").then((module) => ({ default: module.AuthenticatedApp })),
);

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
  const { t } = useTranslation();

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
    <Suspense
      fallback={
        <section aria-live="polite" className="empty-state">
          <h1>{t("auth.loadingTitle")}</h1>
          <p>{t("auth.loadingBody")}</p>
        </section>
      }
    >
      <AuthenticatedApp signOut={auth.signOut} user={auth.user} />
    </Suspense>
  );
}

export function App() {
  return (
    <AuthProvider>
      <AuthGate />
      {/*
        Registered outside the auth gate so the offline shell, update prompt,
        install guidance, and storage warning work for a signed-out visitor too.
      */}
      <PwaUpdatePrompt />
      <InstallPrompt />
      <StoragePressureNotice />
    </AuthProvider>
  );
}
