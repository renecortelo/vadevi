import type { LibraryTopic } from "@vadevi/contracts";
import { resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { getLibraryTopic } from "../services/library";

/**
 * A style or method from the library — orange wine, malolactic fermentation,
 * qvevri — explained from its Wikipedia article in the reader's language,
 * or in another with a note saying so.
 */
export function LibraryTopicPage() {
  const { i18n, t } = useTranslation();
  const locale = resolveSupportedLocale(i18n.language);
  const { user } = useAuth();
  const { topicId = "" } = useParams();
  const [topic, setTopic] = useState<{ key: string; value: LibraryTopic | null } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const key = `${topicId}:${locale}`;

  useEffect(() => {
    if (user === null) return;
    const controller = new AbortController();
    getLibraryTopic(user, topicId, locale, controller.signal)
      .then((value) => setTopic({ key, value }))
      .catch(() => {
        if (!controller.signal.aborted) setFailed(key);
      });
    return () => controller.abort();
  }, [key, locale, topicId, user]);

  const entry = topic?.key === key ? topic.value : undefined;
  if (entry === undefined || entry === null) {
    return (
      <section className="library-page">
        <header className="page-heading">
          <div>
            <p className="eyebrow">{t("library.home.tab.topics")}</p>
            <h1>{t("library.home.title")}</h1>
            <p role={failed === key ? "alert" : "status"}>
              {failed === key
                ? t("library.error")
                : entry === null
                  ? t("library.topicMissing")
                  : t("library.loading")}
            </p>
          </div>
        </header>
      </section>
    );
  }

  const otherLanguage =
    entry.summary !== null &&
    entry.summary.locale !== locale &&
    entry.summary.locale !== i18n.language.split("-")[0];
  return (
    <section className="library-page">
      <p className="section-help">
        <Link className="text-link" to="/library?tab=topics">
          ← {t("library.home.title")}
        </Link>
      </p>
      <header className="page-heading">
        <div>
          <p className="eyebrow">{t(`library.topicCategory.${entry.category}`)}</p>
          <h1>{entry.name}</h1>
          {entry.otherNames.length === 0 ? null : <p>{entry.otherNames.join(" · ")}</p>}
        </div>
      </header>
      {entry.summary === null ? null : (
        <section className="settings-card library-summary">
          <p lang={entry.summary.locale === "pt-PT" ? "pt" : entry.summary.locale}>
            {entry.summary.text}
          </p>
          <p className="section-help">
            <a
              className="text-link"
              href={entry.summary.sourceUrl}
              rel="noreferrer"
              target="_blank"
            >
              {t("library.summarySource")}
            </a>
            {entry.summary.translated
              ? ` · ${t("library.summaryTranslated")}`
              : otherLanguage
                ? ` · ${t("library.summaryOtherLanguage")}`
                : null}
          </p>
        </section>
      )}
      <p className="section-help">
        <Link className="text-link" to="/vicenc">
          {t("library.askVicenc", { name: entry.name })}
        </Link>
      </p>
    </section>
  );
}
