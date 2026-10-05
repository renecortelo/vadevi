import { localeLabels, supportedLocales, type SupportedLocale } from "@vadevi/i18n/runtime";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { changeLanguage } from "../i18n";
import { useSession } from "../session/SessionContext";

/**
 * Interface language, changeable from anywhere in the application.
 *
 * The language was previously only asked once, during onboarding, which left a
 * member who chose wrongly — or who reads a second language better — with no way
 * back except recreating the account.
 *
 * This is the *reader's* language, not the Space's. A Space carries its own
 * default locale for the content created inside it; changing that would change
 * it for everyone, so the two are kept apart on purpose.
 *
 * Like the theme, the choice is saved to the account so it follows the member
 * between devices. The interface switches immediately either way, so a failed
 * save never leaves the control looking broken.
 */
/** "ES", "CA", "PT": the language's own two letters. */
function localeCode(locale: SupportedLocale): string {
  return locale.slice(0, 2).toUpperCase();
}

export function LocaleToggle() {
  const { t } = useTranslation();
  const { bootstrap, isUpdating, updateProfile } = useSession();
  const saved = bootstrap.data.user.preferredLocale;
  const [pending, setPending] = useState<SupportedLocale | null>(null);
  const [failed, setFailed] = useState(false);
  // The account is the source of truth; a pending local choice wins only until
  // the save round-trips.
  const locale = pending ?? saved;

  async function choose(next: SupportedLocale) {
    setFailed(false);
    setPending(next);
    void changeLanguage(next);
    try {
      await updateProfile({ preferredLocale: next });
      setPending(null);
    } catch {
      setFailed(true);
    }
  }

  return (
    <div className="locale-toggle">
      <label className="sr-only" htmlFor="interface-locale">
        {t("locale.label")}
      </label>
      {/* Two letters in the bar, the full names in the menu: the native menu
          opens over the code, which is all a glance needs. Codes, not flags —
          a language is not a country, and English or Catalan has no one flag. */}
      <span aria-hidden="true" className="locale-toggle__code">
        {localeCode(locale)}
      </span>
      <select
        aria-busy={isUpdating}
        id="interface-locale"
        onChange={(event) => void choose(event.target.value as SupportedLocale)}
        value={locale}
      >
        {supportedLocales.map((option) => (
          <option key={option} value={option}>
            {localeLabels[option]}
          </option>
        ))}
      </select>
      {failed ? (
        <span className="form-error" role="alert">
          {t("locale.saveError")}
        </span>
      ) : null}
    </div>
  );
}
