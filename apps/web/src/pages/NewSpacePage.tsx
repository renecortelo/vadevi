import type { CreateSpaceRequest } from "@vadevi/contracts";
import { localeLabels, supportedLocales, type SupportedLocale } from "@vadevi/i18n/runtime";
import { type FormEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";

import { useSession } from "../session/SessionContext";

export function NewSpacePage() {
  const { bootstrap, createSpace, isUpdating } = useSession();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [type, setType] = useState<CreateSpaceRequest["type"]>("couple");
  const [defaultLocale, setDefaultLocale] = useState<SupportedLocale>(
    bootstrap.data.user.preferredLocale,
  );
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(false);
    try {
      await createSpace({ defaultLocale, name, type });
      navigate("/spaces");
    } catch {
      setError(true);
    }
  }

  return (
    <section className="settings-page">
      <p className="eyebrow">{t("spaces.newEyebrow")}</p>
      <h1>{t("spaces.newTitle")}</h1>
      <p className="settings-page__lede">{t("spaces.newBody")}</p>

      <form className="profile-form settings-card" onSubmit={(event) => void submit(event)}>
        <fieldset className="choice-fieldset">
          <legend>{t("spaces.typeLabel")}</legend>
          <label className="choice-card">
            <input
              checked={type === "couple"}
              name="space-type"
              onChange={() => setType("couple")}
              type="radio"
            />
            <span>
              <strong>{t("spaces.coupleTitle")}</strong>
              <small>{t("spaces.coupleBody")}</small>
            </span>
          </label>
          <label className="choice-card">
            <input
              checked={type === "group"}
              name="space-type"
              onChange={() => setType("group")}
              type="radio"
            />
            <span>
              <strong>{t("spaces.groupTitle")}</strong>
              <small>{t("spaces.groupBody")}</small>
            </span>
          </label>
        </fieldset>

        <label htmlFor="space-name">{t("spaces.nameLabel")}</label>
        <input
          autoComplete="off"
          id="space-name"
          maxLength={120}
          onChange={(event) => setName(event.target.value)}
          required
          value={name}
        />

        <label htmlFor="space-locale">{t("spaces.localeLabel")}</label>
        <select
          id="space-locale"
          onChange={(event) => setDefaultLocale(event.target.value as SupportedLocale)}
          value={defaultLocale}
        >
          {supportedLocales.map((locale) => (
            <option key={locale} value={locale}>
              {localeLabels[locale]}
            </option>
          ))}
        </select>

        <button
          aria-busy={isUpdating}
          className="primary-button"
          disabled={isUpdating || name.trim().length === 0}
          type="submit"
        >
          {isUpdating ? t("spaces.creating") : t("spaces.createAction")}
        </button>
        {error ? (
          <p className="form-error" role="alert">
            {t("spaces.createError")}
          </p>
        ) : null}
      </form>
    </section>
  );
}
