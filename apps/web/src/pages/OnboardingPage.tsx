import { supportedLocales, type SupportedLocale } from "@vadevi/i18n";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";

import { i18n } from "../i18n";
import { useSession } from "../session/SessionContext";

const localeLabels: Record<SupportedLocale, string> = {
  ca: "Català",
  de: "Deutsch",
  en: "English",
  es: "Español",
  fr: "Français",
  it: "Italiano",
  nl: "Nederlands",
  "pt-PT": "Português",
};

export function OnboardingPage() {
  const { bootstrap, isUpdating, updateProfile } = useSession();
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(bootstrap.data.user.displayName);
  const [locale, setLocale] = useState<SupportedLocale>(bootstrap.data.user.preferredLocale);
  const [error, setError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    try {
      await updateProfile({
        completeOnboarding: true,
        displayName,
        preferredLocale: locale,
      });
      await i18n.changeLanguage(locale);
    } catch {
      setError(true);
    }
  }

  return (
    <main className="access-page" id="main-content">
      <section className="access-card">
        <p className="access-card__wordmark">{t("appName")}</p>
        <p className="eyebrow">{t("auth.onboardingEyebrow")}</p>
        <h1>{t("auth.onboardingTitle")}</h1>
        <p>{t("auth.onboardingBody")}</p>

        <form className="profile-form" onSubmit={(event) => void handleSubmit(event)}>
          <label htmlFor="display-name">{t("auth.displayName")}</label>
          <input
            autoComplete="name"
            id="display-name"
            maxLength={120}
            onChange={(event) => setDisplayName(event.target.value)}
            required
            type="text"
            value={displayName}
          />

          <label htmlFor="preferred-locale">{t("auth.preferredLocale")}</label>
          <select
            id="preferred-locale"
            onChange={(event) => setLocale(event.target.value as SupportedLocale)}
            value={locale}
          >
            {supportedLocales.map((supportedLocale) => (
              <option key={supportedLocale} value={supportedLocale}>
                {localeLabels[supportedLocale]}
              </option>
            ))}
          </select>

          <button
            aria-busy={isUpdating}
            className="primary-button"
            disabled={isUpdating || displayName.trim().length === 0}
            type="submit"
          >
            {isUpdating ? t("auth.saving") : t("auth.onboardingAction")}
          </button>
          {error ? (
            <p className="form-error" role="alert">
              {t("auth.onboardingError")}
            </p>
          ) : null}
        </form>
      </section>
    </main>
  );
}
