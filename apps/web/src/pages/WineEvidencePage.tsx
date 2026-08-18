import type {
  Fact,
  ResearchJob,
  ResearchJobWarning,
  SupportedLocale,
  WineFactsResponse,
  WineSummary,
} from "@vadevi/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { createIdempotencyKey } from "../security/idempotency";
import { getWineMemory } from "../services/api";
import { acceptFact, createResearchJob, getWineFacts } from "../services/assistant";
import { useSession } from "../session/SessionContext";

function translationCode(value: string) {
  return value.replaceAll(".", "_");
}

const supportedLocales = new Set<SupportedLocale>([
  "ca",
  "de",
  "en",
  "es",
  "fr",
  "it",
  "nl",
  "pt-PT",
]);

function researchLocale(language: string, fallback: SupportedLocale): SupportedLocale {
  if (supportedLocales.has(language as SupportedLocale)) return language as SupportedLocale;
  const base = language.split("-", 1)[0];
  return supportedLocales.has(base as SupportedLocale) ? (base as SupportedLocale) : fallback;
}

function FactValue({ fact }: { fact: Fact }) {
  const { t } = useTranslation();
  if (Array.isArray(fact.value)) return <>{fact.value.join(", ")}</>;
  if (typeof fact.value === "boolean") {
    return <>{t(fact.value ? "evidence.valueYes" : "evidence.valueNo")}</>;
  }
  if (fact.predicate === "production.aging_months" && typeof fact.value === "number") {
    return <>{t("evidence.monthCount", { count: fact.value })}</>;
  }
  return <>{String(fact.value)}</>;
}

function EvidenceChip({ fact }: { fact: Fact }) {
  const { t } = useTranslation();
  return (
    <span className="evidence-chip" data-evidence={fact.evidenceClass}>
      {t(`evidence.class.${fact.evidenceClass}`)}
    </span>
  );
}

export function FactCard({
  accepting,
  fact,
  onAccept,
}: {
  accepting: boolean;
  fact: Fact;
  onAccept: (fact: Fact) => void;
}) {
  const { i18n, t } = useTranslation();
  const valueId = `fact-value-${fact.id}`;
  return (
    <article className="fact-card" data-status={fact.status}>
      <div className="fact-card__heading">
        <EvidenceChip fact={fact} />
        <span className="fact-status" data-status={fact.status}>
          {t(`evidence.status.${fact.status}`)}
        </span>
      </div>
      <h3 className="fact-card__value" id={valueId}>
        <FactValue fact={fact} />
      </h3>
      {fact.confidenceMilli === null ? null : (
        <p className="fact-card__confidence">
          {t("evidence.confidence", { value: Math.round(fact.confidenceMilli / 10) })}
        </p>
      )}
      {fact.citations.length === 0 ? (
        <p className="fact-card__uncited">{t("evidence.noCitations")}</p>
      ) : (
        <ul aria-label={t("evidence.sourcesLabel")} className="citation-list">
          {fact.citations.map((citation: Fact["citations"][number]) => (
            <li key={citation.source.id}>
              <div>
                <a href={citation.source.canonicalUrl} rel="noreferrer" target="_blank">
                  {citation.source.title}
                </a>
                <span>
                  {citation.source.publisher} ·{" "}
                  {t(`evidence.sourceType.${citation.source.sourceType}`)}
                </span>
              </div>
              <div className="citation-list__meta">
                <span>{t(`evidence.support.${citation.supportStrength}`)}</span>
                <time dateTime={citation.source.retrievedAt}>
                  {t("evidence.retrieved", {
                    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                      new Date(citation.source.retrievedAt),
                    ),
                  })}
                </time>
                {citation.source.licenseIdentifier === undefined ? null : (
                  <span>
                    {t("evidence.license", {
                      license: citation.source.licenseIdentifier,
                    })}
                  </span>
                )}
                {citation.locator === null ? null : <span>{citation.locator}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
      {fact.status === "accepted" || fact.status === "retired" ? null : (
        <button
          className="action-link action-link--secondary"
          aria-describedby={valueId}
          disabled={accepting}
          onClick={() => onAccept(fact)}
          type="button"
        >
          {accepting ? t("evidence.accepting") : t("evidence.acceptAction")}
        </button>
      )}
    </article>
  );
}

export function WineEvidencePage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const { wineId = "" } = useParams();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const [response, setResponse] = useState<WineFactsResponse | null>(null);
  const [wine, setWine] = useState<WineSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchJob, setResearchJob] = useState<ResearchJob | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine);
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const loadFacts = useCallback(
    async (signal?: AbortSignal) => {
      if (user === null || wineId.length === 0) return;
      const facts = await getWineFacts(user, spaceId, wineId, signal);
      setResponse(facts);
    },
    [spaceId, user, wineId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        await loadFacts(controller.signal);
      } catch {
        if (!controller.signal.aborted) setError(t("evidence.loadError"));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [loadFacts, t]);

  useEffect(() => {
    if (user === null || wineId.length === 0) return;
    const controller = new AbortController();
    void getWineMemory(user, spaceId, { limit: 100 }, controller.signal)
      .then((memory) => {
        setWine(memory.data.find((candidate: WineSummary) => candidate.id === wineId) ?? null);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [spaceId, user, wineId]);

  const factsByPredicate = useMemo(() => {
    const groups = new Map<Fact["predicate"], Fact[]>();
    for (const fact of response?.data.facts ?? []) {
      const facts = groups.get(fact.predicate) ?? [];
      facts.push(fact);
      groups.set(fact.predicate, facts);
    }
    return [...groups.entries()];
  }, [response]);

  async function chooseFact(fact: Fact) {
    if (user === null) return;
    setAcceptingId(fact.id);
    setError(null);
    try {
      await acceptFact(user, spaceId, fact.id, { version: fact.version });
      await loadFacts();
    } catch {
      setError(t("evidence.acceptError"));
    } finally {
      setAcceptingId(null);
    }
  }

  async function researchWine() {
    if (user === null || wineId.length === 0 || !online) return;
    setResearching(true);
    setResearchError(null);
    try {
      // No hand-typed Wikidata IDs: the barcode lookup runs automatically on the
      // server, and searching a source by name is coming with the knowledge
      // layer. Asking a reader for a "Q…" identifier was never something they
      // could answer.
      const result = await createResearchJob(
        user,
        spaceId,
        wineId,
        {
          locale: researchLocale(i18n.language, bootstrap.data.user.preferredLocale),
          maxSources: 4,
          // The server resolves the producer and region to sources by name; the
          // reader supplies no codes.
          topics: ["identity", "producer", "region"],
          wikidataEntityIds: {},
        },
        // Every other mutation uses a 43-char base64url key; a raw UUID here
        // failed the Idempotency-Key contract and the request 400'd — which is
        // why "Investigate this wine" always errored.
        createIdempotencyKey(),
      );
      setResearchJob(result.data);
      await loadFacts();
    } catch {
      setResearchError(t("evidence.research.error"));
    } finally {
      setResearching(false);
    }
  }

  return (
    <section className="evidence-page">
      <header className="page-heading evidence-heading">
        <div>
          <Link className="text-link" to="/memory">
            {t("evidence.backAction")}
          </Link>
          <p className="eyebrow">{t("evidence.eyebrow")}</p>
          <h1>{wine?.displayName ?? t("evidence.title")}</h1>
          <p>
            {wine === null
              ? t("evidence.body")
              : t("evidence.wineBody", { producer: wine.producerName })}
          </p>
        </div>
        {wineId.length === 0 ? null : (
          <Link className="action-link action-link--primary" to={`/wines/${wineId}/taste`}>
            {t("tasting.startAction")}
          </Link>
        )}
      </header>

      {error === null ? null : (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section aria-labelledby="wine-research-title" className="research-panel">
        <div>
          <p className="eyebrow">{t("evidence.research.eyebrow")}</p>
          <h2 id="wine-research-title">{t("evidence.research.title")}</h2>
          <p>{t("evidence.research.body")}</p>
        </div>
        {!bootstrap.data.features.externalResearch ? (
          <p className="research-panel__notice">{t("evidence.research.disabled")}</p>
        ) : (
          <>
            <button
              className="action-link action-link--secondary"
              disabled={researching || !online}
              onClick={() => void researchWine()}
              type="button"
            >
              {researching ? t("evidence.research.running") : t("evidence.research.action")}
            </button>
            {online ? null : (
              <p className="research-panel__notice">{t("evidence.research.offline")}</p>
            )}
          </>
        )}
        {researchError === null ? null : (
          <p className="form-error" role="alert">
            {researchError}
          </p>
        )}
        {researchJob === null ? null : (
          <div aria-live="polite" className="research-result">
            <strong>{t(`evidence.research.status.${researchJob.status}`)}</strong>
            <span>{t("evidence.research.factCount", { count: researchJob.factIds.length })}</span>
            {researchJob.warnings.length === 0 ? null : (
              <ul>
                {researchJob.warnings.map((warning: ResearchJobWarning) => (
                  <li key={warning}>{t(`evidence.research.warning.${warning}`)}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      {loading ? (
        <div aria-live="polite" className="empty-state">
          <h2>{t("evidence.loadingTitle")}</h2>
          <p>{t("evidence.loadingBody")}</p>
        </div>
      ) : null}
      {!loading && response !== null && response.data.conflicts.length > 0 ? (
        <section aria-labelledby="fact-conflicts" className="attention-panel">
          <h2 id="fact-conflicts">{t("evidence.conflictTitle")}</h2>
          <p>{t("evidence.conflictBody", { count: response.data.conflicts.length })}</p>
        </section>
      ) : null}
      {!loading && response !== null && factsByPredicate.length === 0 ? (
        <div className="empty-state">
          <h2>{t("evidence.emptyTitle")}</h2>
          <p>{t("evidence.emptyBody")}</p>
        </div>
      ) : null}
      <div className="fact-groups">
        {factsByPredicate.map(([predicate, facts]) => (
          <section className="fact-group" key={predicate}>
            <div className="section-heading-row">
              <div>
                <p className="eyebrow">{t("evidence.claimLabel")}</p>
                <h2>{t(`evidence.predicate.${translationCode(predicate)}`)}</h2>
              </div>
              <span>{t("evidence.claimCount", { count: facts.length })}</span>
            </div>
            <div className="fact-card-grid">
              {facts.map((fact) => (
                <FactCard
                  accepting={acceptingId === fact.id}
                  fact={fact}
                  key={fact.id}
                  onAccept={(candidate) => void chooseFact(candidate)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
