import { useTranslation } from "react-i18next";
import { AccessBackdrop } from "../brand/AccessBackdrop";
import { BrandLockup } from "../brand/Wordmark";

export function SessionStatusPage({
  action,
  actionKey,
  bodyKey,
  titleKey,
}: {
  action?: () => void;
  actionKey?: string;
  bodyKey: string;
  titleKey: string;
}) {
  const { t } = useTranslation();

  return (
    <main className="access-page" id="main-content">
      <AccessBackdrop />
      <section aria-live="polite" className="access-card">
        <BrandLockup className="access-card__lockup" />
        <h1>{t(titleKey)}</h1>
        <p>{t(bodyKey)}</p>
        {action !== undefined && actionKey !== undefined ? (
          <button className="primary-button" onClick={action} type="button">
            {t(actionKey)}
          </button>
        ) : null}
      </section>
    </main>
  );
}
