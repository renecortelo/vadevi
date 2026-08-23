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

import { ModalDialog } from "../components/ModalDialog";
import { useAuth } from "../auth/AuthContext";
import { createIdempotencyKey } from "../security/idempotency";
import { getWineMemory } from "../services/api";
import {
  createResearchJob,
  getWineFacts,
  regenerateNarrative,
  rejectFact,
} from "../services/assistant";
import { useSession } from "../session/SessionContext";

type ResearchTopic = "grapes" | "identity" | "producer" | "region";

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
  const dismissable = fact.status !== "accepted" && fact.status !== "retired";
  // A small "Discard" text sitting beside the heading — not a floating control.
  // It asks for confirmation through the page, so a stray tap cannot delete a
  // card. Inside a <summary> it also stops the click from toggling the card.
  const discard = dismissable ? (
    <button
      className="fact-card__discard"
      disabled={rejecting}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onReject(fact);
      }}
      type="button"
    >
      {t("evidence.rejectAction")}
    </button>
  ) : null;

  // A web curiosity leads with a short title; the full paragraph is what expands.
  if (fact.predicate === "curiosity.note") {
    const citation = fact.citations[0];
    const title = citation?.source.title ?? String(fact.value).slice(0, 60);
    return (
      <article className="fact-card" data-note="true" data-status={fact.status}>
        <details className="fact-card__note">
          <summary className="fact-card__head">
            <span className="fact-card__note-title">{title}</span>
            {discard}
          </summary>
          <p className="fact-card__note-text" id={valueId}>
            {String(fact.value)}
          </p>
          {citation === undefined ? null : (
            <a
              className="fact-card__note-source"
              href={citation.source.canonicalUrl}
              rel="noreferrer"
              target="_blank"
            >
              {citation.source.publisher}
            </a>
          )}
        </details>
      </article>
    );
  }

  return (
    <article className="fact-card" data-highlight={highlight !== null} data-status={fact.status}>
      <div className="fact-card__head">
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
        {discard}
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
  const [pendingDiscard, setPendingDiscard] = useState<Fact | null>(null);
  const [rewriting, setRewriting] = useState(false);
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
      // A discarded claim is retired, not deleted — it stays in the record for the
      // audit trail, but the reader threw it out, so it must leave their screen.
      if (fact.predicate === "research.summary" || fact.status === "retired") continue;
      const facts = groups.get(fact.predicate) ?? [];
      facts.push(fact);
      groups.set(fact.predicate, facts);
    }
    return [...groups.entries()];
  }, [response]);

  async function dismissFact(fact: Fact) {
    if (user === null) return;
    setPendingDiscard(null);
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

  // Rewrite the paragraph from the facts that are still here — discard two of
  // five and the text is rebuilt from the other three, without going back out to
  // the sources. Researching again is the separate, heavier act.
  async function rewriteNarrative() {
    if (user === null || wineId.length === 0 || !online) return;
    setRewriting(true);
    setError(null);
    try {
      await regenerateNarrative(
        user,
        spaceId,
        wineId,
        researchLocale(i18n.language, bootstrap.data.user.preferredLocale),
      );
      await loadFacts();
    } catch {
      setError(t("evidence.rewriteError"));
    } finally {
      setRewriting(false);
    }
  }

  // One tap: research the wine directly. Producer, region, and grapes are all
  // resolved server-side by name — with the plausibility filter that keeps a
  // producer called "Áster" from resolving to the Aster flower genus — so there
  // is no list to pick from. Everything arrives as proposals to keep or discard,
  // never applied behind the reader's back.
  async function runResearch() {
    if (user === null || wineId.length === 0 || !online) return;
    setResearching(true);
    setResearchError(null);
    setResearchJob(null);
    try {
      const topics: ResearchTopic[] = ["identity", "grapes", "producer", "region"];
      const result = await createResearchJob(
        user,
        spaceId,
        wineId,
        {
          locale: researchLocale(i18n.language, bootstrap.data.user.preferredLocale),
          maxSources: 6,
          topics,
        },
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
              onClick={() => void runResearch()}
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
            <div className="research-narrative__actions">
              <button
                className="fact-card__discard"
                disabled={rewriting || !online}
                onClick={() => void rewriteNarrative()}
                type="button"
              >
                {rewriting ? t("evidence.rewriting") : t("evidence.rewriteAction")}
              </button>
              {narrative.status === "accepted" || narrative.status === "retired" ? null : (
                <button
                  className="fact-card__discard"
                  disabled={rejectingId === narrative.id}
                  onClick={() => setPendingDiscard(narrative)}
                  type="button"
                >
                  {rejectingId === narrative.id
                    ? t("evidence.rejecting")
                    : t("evidence.rejectAction")}
                </button>
              )}
            </div>
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
                  onReject={(candidate) => setPendingDiscard(candidate)}
                  rejecting={rejectingId === fact.id}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {pendingDiscard === null ? null : (
        <ModalDialog labelledBy="discard-fact-title" onDismiss={() => setPendingDiscard(null)} open>
          <h2 id="discard-fact-title">{t("evidence.discardConfirmTitle")}</h2>
          <p>{t("evidence.discardConfirmBody")}</p>
          <div className="hero__actions">
            <button
              className="action-link action-link--secondary"
              onClick={() => void dismissFact(pendingDiscard)}
              type="button"
            >
              {t("evidence.rejectAction")}
            </button>
            <button className="action-link" onClick={() => setPendingDiscard(null)} type="button">
              {t("evidence.discardConfirmCancel")}
            </button>
          </div>
        </ModalDialog>
      )}
    </section>
  );
}
