import type {
  Fact,
  ResearchCandidate,
  ResearchCandidateSubject,
  ResearchCandidatesResponse,
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
import {
  createResearchJob,
  getResearchCandidates,
  getWineFacts,
  rejectFact,
} from "../services/assistant";
import { useSession } from "../session/SessionContext";

type ResearchTopic = "grapes" | "identity" | "producer" | "region";
type CandidateData = ResearchCandidatesResponse["data"];

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

function highlightParts(fact: Fact): { answer: string; key: string } | null {
  if (fact.predicate !== "curiosity.highlight" || typeof fact.value !== "string") return null;
  const separator = fact.value.indexOf(": ");
  if (separator <= 0) return null;
  return { answer: fact.value.slice(separator + 2), key: fact.value.slice(0, separator) };
}

export function FactCard({
  fact,
  onReject,
  rejecting,
}: {
  fact: Fact;
  onReject: (fact: Fact) => void;
  rejecting: boolean;
}) {
  const { i18n, t } = useTranslation();
  const valueId = `fact-value-${fact.id}`;
  const highlight = highlightParts(fact);
  return (
    <article className="fact-card" data-highlight={highlight !== null} data-status={fact.status}>
      <div className="fact-card__body">
        <p className="fact-card__value" id={valueId}>
          {highlight === null ? (
            <FactValue fact={fact} />
          ) : (
            <>
              <span className="fact-card__key">{highlight.key}</span>
              <span className="fact-card__answer">{highlight.answer}</span>
            </>
          )}
        </p>
        {fact.status === "accepted" || fact.status === "retired" ? null : (
          <button
            className="action-link action-link--quiet fact-card__dismiss"
            aria-describedby={valueId}
            aria-label={t("evidence.rejectAction")}
            disabled={rejecting}
            onClick={() => onReject(fact)}
            type="button"
          >
            {rejecting ? t("evidence.rejecting") : t("evidence.rejectAction")}
          </button>
        )}
      </div>
      {/* Provenance is kept, but tucked away: the reader wants the fact, not the
          licence and support-strength metadata, unless they go looking for it. */}
      <details className="fact-card__source">
        <summary>{t("evidence.sourceDetails")}</summary>
        <div className="fact-card__source-body">
          <div className="fact-card__heading">
            <EvidenceChip fact={fact} />
            <span className="fact-status" data-status={fact.status}>
              {t(`evidence.status.${fact.status}`)}
            </span>
            {fact.confidenceMilli === null ? null : (
              <span className="fact-card__confidence">
                {t("evidence.confidence", { value: Math.round(fact.confidenceMilli / 10) })}
              </span>
            )}
          </div>
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
                        date: new Intl.DateTimeFormat(i18n.language, {
                          dateStyle: "medium",
                        }).format(new Date(citation.source.retrievedAt)),
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
        </div>
      </details>
    </article>
  );
}

function CandidateChoices({
  choice,
  name,
  onChoose,
  subject,
  subjectLabel,
}: {
  choice: string;
  name: string;
  onChoose: (id: string) => void;
  subject: ResearchCandidateSubject | null;
  subjectLabel: string;
}) {
  const { t } = useTranslation();
  if (subject === null || subject.candidates.length === 0) return null;
  return (
    <fieldset className="research-picker__subject">
      <legend className="research-picker__legend">
        {subjectLabel}: <strong>{subject.term}</strong>
      </legend>
      {subject.candidates.map((candidate: ResearchCandidate) => (
        <label className="research-picker__option" key={candidate.id}>
          <input
            checked={choice === candidate.id}
            name={name}
            onChange={() => onChoose(candidate.id)}
            type="radio"
            value={candidate.id}
          />
          <span className="research-picker__option-body">
            <span className="research-picker__option-label">{candidate.label}</span>
            {candidate.description === null ? null : (
              <span className="research-picker__option-desc">{candidate.description}</span>
            )}
          </span>
        </label>
      ))}
      <label className="research-picker__option">
        <input
          checked={choice === "none"}
          name={name}
          onChange={() => onChoose("none")}
          type="radio"
          value="none"
        />
        <span className="research-picker__option-body">
          <span className="research-picker__option-label">
            {t("evidence.research.picker.none")}
          </span>
        </span>
      </label>
    </fieldset>
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
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchJob, setResearchJob] = useState<ResearchJob | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<CandidateData | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [producerChoice, setProducerChoice] = useState<string>("none");
  const [regionChoice, setRegionChoice] = useState<string>("none");
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

  // The generated/gathered narrative is rendered on its own at the top, so it is
  // pulled out of the per-predicate grouping. The most recent live one wins.
  const narrative = useMemo(() => {
    const summaries = (response?.data.facts ?? []).filter(
      (fact: Fact) => fact.predicate === "research.summary" && fact.status !== "retired",
    );
    return summaries.length === 0 ? null : (summaries[summaries.length - 1] ?? null);
  }, [response]);

  const factsByPredicate = useMemo(() => {
    const groups = new Map<Fact["predicate"], Fact[]>();
    for (const fact of response?.data.facts ?? []) {
      if (fact.predicate === "research.summary") continue;
      const facts = groups.get(fact.predicate) ?? [];
      facts.push(fact);
      groups.set(fact.predicate, facts);
    }
    return [...groups.entries()];
  }, [response]);

  async function dismissFact(fact: Fact) {
    if (user === null) return;
    setRejectingId(fact.id);
    setError(null);
    try {
      await rejectFact(user, spaceId, fact.id, { version: fact.version });
      await loadFacts();
    } catch {
      setError(t("evidence.rejectError"));
    } finally {
      setRejectingId(null);
    }
  }

  // Step one: offer the matching Wikidata entities for the producer and region
  // so the reader can tell a wine region from a same-named genus of arachnids
  // before anything is fetched. No hand-typed "Q…" codes; the barcode lookup for
  // the wine's own identity still runs automatically when the reader confirms.
  async function openResearch() {
    if (user === null || wineId.length === 0 || !online) return;
    setResearchError(null);
    setResearchJob(null);
    setCandidates(null);
    setLoadingCandidates(true);
    try {
      const result = await getResearchCandidates(
        user,
        spaceId,
        wineId,
        researchLocale(i18n.language, bootstrap.data.user.preferredLocale),
      );
      setCandidates(result.data);
      // Nothing is pre-selected: attaching an outside entity to the wine is a
      // deliberate choice the reader makes after reading the descriptions, never
      // a default they might confirm without noticing.
      setProducerChoice("none");
      setRegionChoice("none");
    } catch {
      setResearchError(t("evidence.research.error"));
    } finally {
      setLoadingCandidates(false);
    }
  }

  function cancelResearch() {
    setCandidates(null);
    setResearchError(null);
  }

  // Step two: research only what the reader chose. Each picked entity becomes a
  // Wikidata topic with its confirmed id; a "none" choice is left out entirely,
  // so nothing is resolved behind the reader's back. Results still arrive as
  // proposals to accept — confirming an entity is not the same as trusting a fact.
  async function confirmResearch() {
    if (user === null || wineId.length === 0 || !online) return;
    setResearching(true);
    setResearchError(null);
    try {
      // "grapes" is always requested: the wine's varieties are resolved and
      // researched server-side by name, contributing their own highlights. There
      // is nothing for the reader to pick, so it needs no entry in the picker.
      const topics: ResearchTopic[] = ["identity", "grapes"];
      const wikidataEntityIds: { producer?: string; region?: string } = {};
      if (producerChoice !== "none") {
        wikidataEntityIds.producer = producerChoice;
        topics.push("producer");
      }
      if (regionChoice !== "none") {
        wikidataEntityIds.region = regionChoice;
        topics.push("region");
      }
      const result = await createResearchJob(
        user,
        spaceId,
        wineId,
        {
          locale: researchLocale(i18n.language, bootstrap.data.user.preferredLocale),
          maxSources: 4,
          topics,
          wikidataEntityIds,
        },
        createIdempotencyKey(),
      );
      setResearchJob(result.data);
      setCandidates(null);
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
        ) : candidates === null ? (
          <>
            <button
              className="action-link action-link--secondary"
              disabled={loadingCandidates || researching || !online}
              onClick={() => void openResearch()}
              type="button"
            >
              {loadingCandidates ? t("evidence.research.searching") : t("evidence.research.action")}
            </button>
            {online ? null : (
              <p className="research-panel__notice">{t("evidence.research.offline")}</p>
            )}
          </>
        ) : (
          <div className="research-picker">
            {(candidates.producer?.candidates.length ?? 0) === 0 &&
            (candidates.region?.candidates.length ?? 0) === 0 ? (
              <p className="research-panel__notice">{t("evidence.research.picker.noneFound")}</p>
            ) : (
              <p className="research-picker__help">{t("evidence.research.picker.help")}</p>
            )}
            <CandidateChoices
              choice={producerChoice}
              name="research-producer"
              onChoose={setProducerChoice}
              subject={candidates.producer}
              subjectLabel={t("evidence.research.picker.producer")}
            />
            <CandidateChoices
              choice={regionChoice}
              name="research-region"
              onChoose={setRegionChoice}
              subject={candidates.region}
              subjectLabel={t("evidence.research.picker.region")}
            />
            <div className="research-picker__actions">
              <button
                className="action-link action-link--primary"
                disabled={researching || !online}
                onClick={() => void confirmResearch()}
                type="button"
              >
                {researching
                  ? t("evidence.research.running")
                  : t("evidence.research.picker.confirm")}
              </button>
              <button
                className="action-link action-link--secondary"
                disabled={researching}
                onClick={cancelResearch}
                type="button"
              >
                {t("evidence.research.picker.cancel")}
              </button>
            </div>
          </div>
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
      {!loading && response !== null && factsByPredicate.length === 0 && narrative === null ? (
        <div className="empty-state">
          <h2>{t("evidence.emptyTitle")}</h2>
          <p>{t("evidence.emptyBody")}</p>
        </div>
      ) : null}
      {narrative === null ? null : (
        <section aria-labelledby="research-narrative" className="research-narrative">
          <h2 id="research-narrative">{t("evidence.summaryTitle")}</h2>
          <p className="research-narrative__text">{String(narrative.value)}</p>
          <div className="research-narrative__footer">
            {narrative.citations[0] === undefined ? null : (
              <a href={narrative.citations[0].source.canonicalUrl} rel="noreferrer" target="_blank">
                {narrative.citations[0].source.publisher}
              </a>
            )}
            {narrative.status === "accepted" || narrative.status === "retired" ? null : (
              <button
                className="action-link action-link--quiet"
                disabled={rejectingId === narrative.id}
                onClick={() => void dismissFact(narrative)}
                type="button"
              >
                {rejectingId === narrative.id
                  ? t("evidence.rejecting")
                  : t("evidence.rejectAction")}
              </button>
            )}
          </div>
        </section>
      )}
      <div className="fact-groups">
        {factsByPredicate.map(([predicate, facts]) => (
          <section
            className="fact-group"
            data-highlights={predicate === "curiosity.highlight"}
            key={predicate}
          >
            <div className="section-heading-row">
              <h2>
                {predicate === "curiosity.highlight"
                  ? t("evidence.highlightsTitle")
                  : t(`evidence.predicate.${translationCode(predicate)}`)}
              </h2>
              <span>{t("evidence.claimCount", { count: facts.length })}</span>
            </div>
            <div
              className={
                predicate === "curiosity.highlight" ? "fact-highlight-grid" : "fact-card-grid"
              }
            >
              {facts.map((fact) => (
                <FactCard
                  fact={fact}
                  key={fact.id}
                  onReject={(candidate) => void dismissFact(candidate)}
                  rejecting={rejectingId === fact.id}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
