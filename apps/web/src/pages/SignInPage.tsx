import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";

export function SignInPage() {
  const { isEmulator, signIn } = useAuth();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    setError(false);
    try {
      await signIn();
    } catch {
      setBusy(false);
      setError(true);
    }
  }

  return (
    <main className="access-page" id="main-content">
      <section className="access-card access-card--signin">
        <p className="access-card__wordmark">{t("appName")}</p>
        <p className="eyebrow">{t("auth.signInEyebrow")}</p>
        <h1>{t("auth.signInTitle")}</h1>
        <p>{t("auth.signInBody")}</p>
        <button
          aria-busy={busy}
          className="primary-button"
          disabled={busy}
          onClick={() => void handleSignIn()}
          type="button"
        >
          <span aria-hidden="true" className="google-mark">
            G
          </span>
          {busy ? t("auth.redirecting") : t("auth.signInAction")}
        </button>
        {isEmulator ? <p className="local-note">{t("auth.localEmulator")}</p> : null}
        {error ? (
          <p className="form-error" role="alert">
            {t("auth.signInError")}
          </p>
        ) : null}
      </section>
    </main>
  );
}
