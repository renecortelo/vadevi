import { useTranslation } from "react-i18next";

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
      <section aria-live="polite" className="access-card">
        <p className="access-card__wordmark">{t("appName")}</p>
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
