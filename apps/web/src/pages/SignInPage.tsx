import { lazy, Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { AccessBackdrop } from "../brand/AccessBackdrop";
import { SignedOutLocalePicker } from "../components/SignedOutLocalePicker";
import { GoogleMark } from "../brand/GoogleMark";
import { BrandLockup } from "../brand/Wordmark";

// The reel waits until the sign-in card has been drawn and the browser is
// idle: it is not what the first paint is for. Until then the card shows the
// logo the reel ends on, in the same frame, so nothing moves when it arrives.
const SignInReel = lazy(() => import("../home/SignInReel"));

export function SignInPage() {
  const { isEmulator, signIn } = useAuth();
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReel, setShowReel] = useState(false);
  useEffect(() => {
    const show = () => setShowReel(true);
    if ("requestIdleCallback" in globalThis) {
      const handle = requestIdleCallback(show, { timeout: 2500 });
      return () => cancelIdleCallback(handle);
    }
    const handle = setTimeout(show, 1200);
    return () => clearTimeout(handle);
  }, []);

  async function handleSignIn() {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (signInError) {
      setBusy(false);
      // Firebase codes such as `auth/unauthorized-domain` name the actual
      // misconfiguration. Showing it turns an unactionable failure into one a
      // deployer can fix, and it is a diagnostic string, not user data.
      setError((signInError as { code?: string } | null)?.code ?? "unknown");
    }
  }

  return (
    <main className="access-page" id="main-content">
      <AccessBackdrop />
      <SignedOutLocalePicker />
      <section className="access-card access-card--signin">
        <div className="access-card__reel">
          {showReel ? (
            <Suspense fallback={<BrandLockup className="access-card__lockup" />}>
              <SignInReel />
            </Suspense>
          ) : (
            <BrandLockup className="access-card__lockup" />
          )}
        </div>
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
          <GoogleMark />
          {busy ? t("auth.redirecting") : t("auth.signInAction")}
        </button>
        {isEmulator ? <p className="local-note">{t("auth.localEmulator")}</p> : null}
        {error === null ? null : (
          <p className="form-error" role="alert">
            {t("auth.signInError")} <code>{t("auth.signInErrorCode", { code: error })}</code>
          </p>
        )}
      </section>
    </main>
  );
}
