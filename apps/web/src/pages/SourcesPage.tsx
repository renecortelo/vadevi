import { useTranslation } from "react-i18next";

import { sourceGroups, sources } from "../about/sources";
import { webEnvironment } from "../config/env";

/**
 * Sources and licences: where the library's facts, figures, maps and
 * photographs come from and under what terms, in one place — each card
 * still credits its own beside what it shows.
 */
export function SourcesPage() {
  const { t } = useTranslation();
  return (
    <section className="about-page sources-page">
      <header className="page-heading">
        <p className="eyebrow">{t("about.eyebrow")}</p>
        <h1>{t("sources.title")}</h1>
        <p>{t("sources.intro")}</p>
      </header>
      {sourceGroups.map((group) => (
        <section aria-labelledby={`sources-${group}`} className="settings-card" key={group}>
          <h2 id={`sources-${group}`}>{t(`sources.group.${group}`)}</h2>
          <ul className="sources-list">
            {sources
              .filter((source) => source.group === group)
              .map((source) => (
                <li key={`${source.name}-${source.what}`}>
                  <a className="text-link" href={source.url} rel="noreferrer" target="_blank">
                    {source.name}
                  </a>
                  <span className="sources-list__what">{t(`sources.what.${source.what}`)}</span>
                  <span className="sources-list__terms">
                    {[
                      source.licence,
                      source.terms === undefined ? undefined : t(`sources.terms.${source.terms}`),
                      source.credit,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="sources-rules" className="settings-card">
        <h2 id="sources-rules">{t("sources.rulesTitle")}</h2>
        <ul className="sources-notes">
          <li>{t("sources.shareAlike")}</li>
          <li>{t("sources.pairings")}</li>
          <li>{t("sources.declined")}</li>
          <li>{t("sources.noCommercial")}</li>
        </ul>
        <a
          className="action-link action-link--secondary"
          href={webEnvironment.sourceUrl}
          rel="noreferrer noopener"
          target="_blank"
        >
          {t("sources.readme")}
        </a>
      </section>
    </section>
  );
}
