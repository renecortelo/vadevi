import type {
  Fact,
  ResearchJob,
  ResearchJobWarning,
  SupportedLocale,
  WineFactsResponse,
  WineSummary,
} from "@vadevi/contracts";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useParams } from "react-router";

import { MapLink } from "../components/MapLink";
import { EditWineDialog } from "../components/EditWineDialog";
import { flagOf } from "../library/flag";
import { TrailBackLink } from "../library/TrailBackLink";
import { trailFrom } from "../library/trail";
import { TastingHistory } from "../components/TastingHistory";
import { BottlePhotoPicker } from "../components/BottlePhotoPicker";
import { ModalDialog } from "../components/ModalDialog";
import { PrivateWineImage } from "../components/PrivateWineImage";
import { useAuth } from "../auth/AuthContext";
import { createIdempotencyKey } from "../security/idempotency";
import { getWine } from "../services/api";
import {
  createResearchJob,
  getWineFacts,
  regenerateNarrative,
  regenerateTastingComparison,
  rejectFact,
} from "../services/assistant";
import { searchLibraryRegions } from "../services/library";
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

  // A web curiosity or a pairing note both lead with a short title; the full
  // paragraph is what expands, with its source underneath.
  if (fact.predicate === "curiosity.note" || fact.predicate === "pairing.note") {
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
  const location = useLocation();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const sharedSpace =
    bootstrap.data.spaces.find((space) => space.id === spaceId)?.type !== "personal";
  const [response, setResponse] = useState<WineFactsResponse | null>(null);
  const [wine, setWine] = useState<WineSummary | null>(null);
  // Corrected here, as from the list: the dialog, and a reload when saved.
  const [editingWine, setEditingWine] = useState(false);
  const [wineReload, setWineReload] = useState(0);
  const [loading, setLoading] = useState(true);
  // A catalogue key, translated where it is shown.
  const [error, setError] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [pendingDiscard, setPendingDiscard] = useState<Fact | null>(null);
  const [rewriting, setRewriting] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [comparisonNotice, setComparisonNotice] = useState<string | null>(null);
  const [researching, setResearching] = useState(false);
  const [photoAdopted, setPhotoAdopted] = useState(false);
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

  // Read in the interface's language. The evidence used to be fetched as
  // written, so changing the language up top changed every label on this page
  // and none of the evidence — the paragraph could be regenerated, which wrote
  // a new one in the new language, and the curiosities and pairings stayed as
  // they were. The language is a dependency here, so switching it reloads.
  const locale = researchLocale(i18n.language, bootstrap.data.user.preferredLocale);
  const loadFacts = useCallback(
    async (signal?: AbortSignal) => {
      if (user === null || wineId.length === 0) return;
      const facts = await getWineFacts(user, spaceId, wineId, signal, locale);
      setResponse(facts);
    },
    [locale, spaceId, user, wineId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        await loadFacts(controller.signal);
      } catch {
        if (!controller.signal.aborted) setError("evidence.loadError");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
    // The error is kept as a key and translated at render, so `t` is not a
    // dependency here. It was, and a language change re-ran this twice — once
    // when the catalogue arrived and once when the language did — sending the
    // same read, and the same translation, to the server two times over.
  }, [loadFacts]);

  useEffect(() => {
    if (user === null || wineId.length === 0) return;
    const controller = new AbortController();
    // Fetched by id. This used to list a hundred wines and filter here, which
    // quietly lost the title, the producer and the last venue for any wine past
    // the hundredth while the facts below carried on loading.
    void getWine(user, spaceId, wineId, controller.signal)
      .then(setWine)
      .catch(() => setWine(null));
    return () => controller.abort();
  }, [spaceId, user, wineId, wineReload]);

  // The wine's region, when the atlas has it as a registered name: a link is
  // shown only for a name that resolves, never one that leads nowhere.
  // Kept with the name it answers, so a stale answer is never shown for
  // another wine's region.
  const [atlasMatch, setAtlasMatch] = useState<{
    key: string;
    region: { id: string; name: string } | null;
  } | null>(null);
  const wineRegion = wine?.region ?? null;
  const wineCountry = wine?.countryCode ?? null;
  const atlasKey = `${wineCountry ?? ""}:${wineRegion ?? ""}`;
  const atlasRegion = atlasMatch?.key === atlasKey ? atlasMatch.region : null;
  useEffect(() => {
    if (user === null || wineRegion === null) return;
    const controller = new AbortController();
    void searchLibraryRegions(user, wineRegion, wineCountry, controller.signal)
      .then((found) => setAtlasMatch({ key: atlasKey, region: found[0] ?? null }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [atlasKey, user, wineCountry, wineRegion]);

  // The generated/gathered narrative is rendered on its own at the top, so it is
  // pulled out of the per-predicate grouping. The most recent live one wins.
  const narrative = useMemo(() => {
    const summaries = (response?.data.facts ?? []).filter(
      (fact: Fact) => fact.predicate === "research.summary" && fact.status !== "retired",
    );
    return summaries.length === 0 ? null : (summaries[summaries.length - 1] ?? null);
  }, [response]);

  // The comparison paragraph has its own place on the page, under the narrative,
  // so it too is pulled out of the per-predicate grouping.
  const comparison = useMemo(() => {
    const paragraphs = (response?.data.facts ?? []).filter(
      (fact: Fact) => fact.predicate === "tasting.comparison" && fact.status !== "retired",
    );
    return paragraphs.length === 0 ? null : (paragraphs[paragraphs.length - 1] ?? null);
  }, [response]);

  const factsByPredicate = useMemo(() => {
    const groups = new Map<Fact["predicate"], Fact[]>();
    for (const fact of response?.data.facts ?? []) {
      // A discarded claim is retired, not deleted — it stays in the record for the
      // audit trail, but the reader threw it out, so it must leave their screen.
      if (
        fact.predicate === "research.summary" ||
        fact.predicate === "tasting.comparison" ||
        fact.status === "retired"
      ) {
        continue;
      }
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
      setError("evidence.rejectError");
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
      await regenerateNarrative(user, spaceId, wineId, locale);
      await loadFacts();
    } catch {
      setError("evidence.rewriteError");
    } finally {
      setRewriting(false);
    }
  }

  // Set the tasting against the sources. The paragraph is written once and kept
  // as evidence — it only changes when someone tastes the wine again or the
  // research turns up something new — so this is a deliberate act, not something
  // the page spends a model call on every time it opens.
  async function writeComparison() {
    if (user === null || wineId.length === 0 || !online) return;
    setComparing(true);
    setError(null);
    setComparisonNotice(null);
    try {
      const result = await regenerateTastingComparison(user, spaceId, wineId, locale);
      if (result.data.status === "no_material") {
        setComparisonNotice(t("evidence.comparison.noMaterial"));
      }
      await loadFacts();
    } catch {
      setError("evidence.comparison.error");
    } finally {
      setComparing(false);
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
        { locale, maxSources: 6, topics },
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

  // The library pages this one links to show a way back here.
  const backHere = trailFrom(
    wine?.displayName ?? t("evidence.title"),
    `${location.pathname}${location.search}`,
  );

  return (
    <section className="evidence-page">
      {wine === null || !editingWine ? null : (
        <EditWineDialog
          onClose={() => setEditingWine(false)}
          onSaved={() => setWineReload((current) => current + 1)}
          wine={wine}
        />
      )}
      <header className="page-heading evidence-heading">
        {/* The bottle itself, beside its name. The card showed it and this
            screen did not, so opening a wine lost the one thing that made it
            recognisable at a glance. */}
        {wine === null || wine.mediaId === null ? null : (
          <div className="evidence-heading__photo">
            <PrivateWineImage
              mediaId={wine.mediaId}
              name={`${wine.producerName} ${wine.displayName}`}
              spaceId={spaceId}
            />
          </div>
        )}
        <div className="evidence-heading__text">
          {/* Reached from the cellar book, the way back to it first. */}
          <p className="evidence-heading__back">
            <TrailBackLink />
            <Link className="text-link" to="/memory">
              ← {t("evidence.backAction")}
            </Link>
          </p>
          <p className="eyebrow">{t("evidence.eyebrow")}</p>
          <h1>{wine?.displayName ?? t("evidence.title")}</h1>
          <p>
            {wine === null
              ? t("evidence.body")
              : t("evidence.wineBody", { producer: wine.producerName })}
          </p>
          {wine === null ? null : (
            <p className="evidence-heading__place">
              {[
                wine.vintageYear === null ? null : String(wine.vintageYear),
                wine.region,
                wine.countryCode === null
                  ? t("evidence.noCountry")
                  : `${flagOf(wine.countryCode)} ${
                      new Intl.DisplayNames([i18n.language], { type: "region" }).of(
                        wine.countryCode,
                      ) ?? wine.countryCode
                    }`,
              ]
                .filter(Boolean)
                .join(" · ")}{" "}
              <button
                className="action-link action-link--secondary"
                onClick={() => setEditingWine(true)}
                type="button"
              >
                {t("memory.editAction")}
              </button>
            </p>
          )}
          {/* Its grapes, each a way into the wine library's card for it. */}
          {wine === null || wine.grapes.length === 0 ? null : (
            <p className="evidence-heading__grapes">
              <span>{t("library.grapesLink")}:</span>
              {wine.grapes.map((grape) => (
                <Link
                  className="text-link"
                  key={grape.name}
                  state={backHere}
                  to={`/library/grape?name=${encodeURIComponent(grape.name)}`}
                >
                  {grape.name}
                </Link>
              ))}
            </p>
          )}
          {atlasRegion === null ? null : (
            <p className="evidence-heading__grapes">
              <span>{t("library.atlasEyebrow")}:</span>
              <Link
                className="text-link"
                state={backHere}
                to={`/library/regions/${atlasRegion.id}`}
              >
                {atlasRegion.name}
              </Link>
            </p>
          )}
          {/* Where and when you last drank it, with directions. The venue lives
              on the tasting, but this is where you come looking for a wine's
              history, so this is where it has to be reachable. */}
          {wine?.lastVenue === undefined ? null : (
            <p className="evidence-heading__venue">
              {/* The sentence with the place's name as the link to the map. */}
              {t("evidence.lastVenue", {
                date: new Date(wine.lastVenue.tastedAt).toLocaleDateString(i18n.language),
                venue: "\u0000",
              })
                .split("\u0000")
                .map((part, index) =>
                  index === 0 ? (
                    <Fragment key="before">{part}</Fragment>
                  ) : (
                    <Fragment key="after">
                      <MapLink
                        className="venue-link"
                        latitude={wine.lastVenue!.latitude}
                        longitude={wine.lastVenue!.longitude}
                        name={wine.lastVenue!.name}
                      >
                        {wine.lastVenue!.name}
                      </MapLink>
                      {part}
                    </Fragment>
                  ),
                )}
            </p>
          )}
        </div>
        {wineId.length === 0 ? null : (
          <TastingHistory count={wine?.noteCount ?? 0} spaceId={spaceId} wineId={wineId} />
        )}
      </header>

      {error === null ? null : (
        <p className="form-error" role="alert">
          {t(error)}
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
        {bootstrap.data.features.bottlePhotoSearch ? (
          <div className="research-panel__photos">
            <h3>{t("evidence.bottlePhoto.title")}</h3>
            <p>{t("evidence.bottlePhoto.body")}</p>
            <BottlePhotoPicker
              onAdopted={() => setPhotoAdopted(true)}
              spaceId={spaceId}
              wineId={wineId}
            />
            {photoAdopted ? (
              <p className="research-panel__notice" role="status">
                {t("evidence.bottlePhoto.adopted")}
              </p>
            ) : null}
          </div>
        ) : null}
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
                className="action-link action-link--secondary"
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
      {loading ? null : (
        <section aria-labelledby="tasting-comparison" className="research-narrative">
          <h2 id="tasting-comparison">{t("evidence.comparison.title")}</h2>
          {comparison === null ? (
            <p className="research-narrative__text">{t("evidence.comparison.empty")}</p>
          ) : (
            <>
              <p className="research-narrative__text">{String(comparison.value)}</p>
              {comparison.researchMethod?.startsWith("tasting.comparison.grapes.") ? (
                <p className="section-help">{t("evidence.comparison.basisGrapes")}</p>
              ) : comparison.researchMethod?.startsWith("tasting.comparison.mixed.") ? (
                <p className="section-help">{t("evidence.comparison.basisMixed")}</p>
              ) : null}
              {/* Written before comparisons named everyone: its "you" is
                  whoever asked for it, not whoever reads it now. */}
              {sharedSpace && comparison.researchMethod?.endsWith(".v1") ? (
                <p className="section-help">{t("evidence.comparison.olderVoice")}</p>
              ) : null}
            </>
          )}
          <div className="research-narrative__footer">
            <span className="fact-card__evidence">{t("evidence.comparison.inferred")}</span>
            <div className="research-narrative__actions">
              <button
                className="action-link action-link--secondary"
                disabled={comparing || !online}
                onClick={() => void writeComparison()}
                type="button"
              >
                {comparing
                  ? t("evidence.comparison.writing")
                  : comparison === null
                    ? t("evidence.comparison.action")
                    : t("evidence.comparison.rewriteAction")}
              </button>
            </div>
          </div>
          {comparisonNotice === null ? null : (
            <p className="research-panel__notice" role="status">
              {comparisonNotice}
            </p>
          )}
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
