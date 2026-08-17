import { localeLabels, supportedLocales, type SupportedLocale } from "@vadevi/i18n/runtime";
import { useTranslation } from "react-i18next";

import { changeLanguage, rememberSignedOutLocale } from "../i18n";

/**
 * Interface language, before there is an account to hang it on.
 *
 * The signed-in control saves to the account. This one cannot — there is no
 * account yet — so it keeps the choice on the device until there is. Which is
 * the point: the sign-in screen is exactly where someone who cannot read the
 * interface needs to change it, and telling them to sign in first is telling
 * them to read something they cannot.
 */
export function SignedOutLocalePicker() {
  const { i18n, t } = useTranslation();
  const current = supportedLocales.find((locale) => locale === i18n.language) ?? "en";

  function choose(next: SupportedLocale) {
    rememberSignedOutLocale(next);
    void changeLanguage(next);
  }

  return (
    <div className="access-locale">
      <label className="sr-only" htmlFor="access-locale">
        {t("locale.label")}
      </label>
      <select
        id="access-locale"
        onChange={(event) => choose(event.target.value as SupportedLocale)}
        value={current}
      >
        {supportedLocales.map((locale) => (
          <option key={locale} value={locale}>
            {localeLabels[locale]}
          </option>
        ))}
      </select>
    </div>
  );
}
