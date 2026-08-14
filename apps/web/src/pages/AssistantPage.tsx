import type {
  AssistantEvidenceChip,
  AssistantRenderedClaim,
  AssistantSearchResult,
  AssistantTurnResponse,
  AssistantWineComparison,
  Fact,
  Source,
  SupportedLocale,
} from "@vadevi/contracts";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { createAssistantTurn } from "../services/api";
import { useSession } from "../session/SessionContext";

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

function currentLocale(language: string): SupportedLocale {
  const candidate = language === "pt" ? "pt-PT" : language.split("-")[0];
  return supportedLocales.has(candidate as SupportedLocale) ? (candidate as SupportedLocale) : "en";
}

export function AssistantResult({ response }: { response: AssistantTurnResponse }) {
  const { i18n, t } = useTranslation();
  const sourceById = new Map<string, Source>(
    response.data.citations.map((source: Source): [string, Source] => [source.id, source]),
  );
  return (
    <section aria-live="polite" className="assistant-response">
      <div className="assistant-response__heading">
        <span className="assistant-mode" data-mode={response.data.mode}>
          {t(`assistant.mode.${response.data.mode}`)}
        </span>
        <span>{t("assistant.ephemeralBadge")}</span>
      </div>
      {response.data.renderedClaims.length === 0 ? (
        <p className="assistant-response__text">{response.data.renderedText}</p>
      ) : (
        <ul className="assistant-claim-list">
          {response.data.renderedClaims.map((claim: AssistantRenderedClaim, index: number) => (
            <li key={`${claim.evidenceClass}-${index}`}>
              <span className="evidence-chip" data-evidence={claim.evidenceClass}>
                {t(`evidence.class.${claim.evidenceClass}`)}
              </span>
              <p>{claim.text}</p>
              {claim.sourceIds.length === 0 ? null : (
                <ul className="citation-list">
                  {claim.sourceIds.map((sourceId: string) => {
                    const source = sourceById.get(sourceId);
                    return source === undefined ? null : (
                      <li key={source.id}>
                        <a href={source.canonicalUrl} rel="noreferrer" target="_blank">
                          {source.title}
                        </a>
                        <span>{source.publisher}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {response.data.evidence.length === 0 ? null : (
        <div className="assistant-evidence" aria-label={t("assistant.evidenceTitle")}>
          {response.data.evidence.map((evidence: AssistantEvidenceChip, index: number) => (
            <span
              className="evidence-chip"
              data-evidence={evidence.evidenceClass}
              key={`${evidence.evidenceClass}-${index}`}
            >
              {evidence.label}
            </span>
          ))}
        </div>
      )}

      {response.data.results.length === 0 ? null : (
        <div>
          <h2>{t("assistant.resultsTitle")}</h2>
          <div className="assistant-result-grid">
            {response.data.results.map((result: AssistantSearchResult) => (
              <article
                className="assistant-result-card"
                key={`${result.spaceId}:${result.wine.id}`}
              >
                <p className="eyebrow">{result.spaceName}</p>
                <h3>{result.wine.displayName}</h3>
                <p>{result.wine.producerName}</p>
                <dl>
                  <div>
                    <dt>{t("quickLog.vintage")}</dt>
                    <dd>
                      {result.wine.nonVintage
                        ? t("quickLog.nonVintageShort")
                        : (result.wine.vintageYear ?? "—")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("memory.notes")}</dt>
                    <dd>{result.wine.noteCount}</dd>
                  </div>
                </dl>
                <Link className="text-link" to={`/wines/${result.wine.id}/evidence`}>
                  {t("assistant.openEvidence")}
                </Link>
              </article>
            ))}
          </div>
        </div>
      )}

      {response.data.wineContext === null ? null : (
        <div className="assistant-context">
          <h2>{t("assistant.contextTitle")}</h2>
          {response.data.wineContext.facts.length === 0 ? (
            <p>{t("assistant.contextEmpty")}</p>
          ) : (
            <ul className="assistant-fact-list">
              {response.data.wineContext.facts.map((fact: Fact) => (
                <li key={fact.id}>
                  <div className="fact-card__heading">
                    <span className="evidence-chip" data-evidence={fact.evidenceClass}>
                      {t(`evidence.class.${fact.evidenceClass}`)}
                    </span>
                    <span>{t(`evidence.predicate.${fact.predicate.replaceAll(".", "_")}`)}</span>
                  </div>
                  <strong>
                    {Array.isArray(fact.value) ? fact.value.join(", ") : String(fact.value)}
                  </strong>
                  {fact.citations.length === 0 ? null : (
                    <ul className="citation-list">
                      {fact.citations.map((citation: Fact["citations"][number]) => (
                        <li key={citation.source.id}>
                          <a href={citation.source.canonicalUrl} rel="noreferrer" target="_blank">
                            {citation.source.title}
                          </a>
                          <span>{citation.source.publisher}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {response.data.tasteProfile === null ? null : (
        <div className="assistant-profile">
          <h2>{t("assistant.profileTitle")}</h2>
          {response.data.tasteProfile.confidence === "insufficient" ? (
            <p>
              {t("assistant.profileInsufficient", {
                count: response.data.tasteProfile.sampleSize,
                minimum: response.data.tasteProfile.minimumSubmittedNotes,
              })}
            </p>
          ) : (
            <dl>
              <div>
                <dt>{t("assistant.profileAverage")}</dt>
                <dd>{response.data.tasteProfile.averageScore?.toFixed(1) ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("assistant.profileWouldBuy")}</dt>
                <dd>{response.data.tasteProfile.wouldBuyYesCount ?? "—"}</dd>
              </div>
              <div>
                <dt>{t("quickLog.descriptors")}</dt>
                <dd>{response.data.tasteProfile.descriptorCodes.join(", ") || "—"}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {response.data.comparisons.length === 0 ? null : (
        <div>
          <h2>{t("assistant.comparisonTitle")}</h2>
          <div className="assistant-comparison-grid">
            {response.data.comparisons.map((comparison: AssistantWineComparison) => (
              <article className="assistant-comparison-card" key={comparison.wineId}>
                <h3>{comparison.wineName}</h3>
                <strong>{t("assistant.factualTitle")}</strong>
                <dl>
                  <div>
                    <dt>{t("quickLog.score")}</dt>
                    <dd>{comparison.factual.score100 ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("memory.notes")}</dt>
                    <dd>{comparison.factual.noteCount}</dd>
                  </div>
                  <div>
                    <dt>{t("quickLog.region")}</dt>
                    <dd>{comparison.factual.region ?? "—"}</dd>
                  </div>
                </dl>
                <strong>{t("assistant.personalTitle")}</strong>
                {comparison.personal.confidence === "insufficient" ? (
                  <p>
                    {t("assistant.personalInsufficient", {
                      count: comparison.personal.sampleSize,
                    })}
                  </p>
                ) : (
                  <p>
                    {t("assistant.personalAverage", {
                      count: comparison.personal.sampleSize,
                      score: comparison.personal.averageScore?.toFixed(1) ?? "—",
                    })}
                  </p>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {response.data.citations.length === 0 ? null : (
        <div>
          <h2>{t("assistant.sourcesTitle")}</h2>
          <ul className="citation-list">
            {response.data.citations.map((source: Source) => (
              <li key={source.id}>
                <a href={source.canonicalUrl} rel="noreferrer" target="_blank">
                  {source.title}
                </a>
                <span>
                  {source.publisher} · {t(`evidence.sourceType.${source.sourceType}`)}
                </span>
                <time dateTime={source.retrievedAt}>
                  {t("evidence.retrieved", {
                    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                      new Date(source.retrievedAt),
                    ),
                  })}
                </time>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="assistant-availability">
        <summary>{t("assistant.availabilityTitle")}</summary>
        <ul>
          <li>{t(`assistant.availability.ai.${response.data.toolAvailability.ai}`)}</li>
          <li>
            {t(
              `assistant.availability.searchMemory.${response.data.toolAvailability.searchMemory}`,
            )}
          </li>
          <li>
            {t(
              `assistant.availability.externalResearch.${response.data.toolAvailability.externalResearch}`,
            )}
          </li>
          <li>{t("assistant.availability.getWineContext.available")}</li>
          <li>{t("assistant.availability.getTasteProfile.available")}</li>
          <li>{t("assistant.availability.compareWines.available")}</li>
          <li>
            {t(
              `assistant.availability.researchWine.${response.data.toolAvailability.researchWine}`,
            )}
          </li>
        </ul>
      </details>
    </section>
  );
}

export function AssistantPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [message, setMessage] = useState("");
  const [response, setResponse] = useState<AssistantTurnResponse | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (user === null || message.trim().length === 0) return;
    setSending(true);
    setError(false);
    try {
      setResponse(
        await createAssistantTurn(user, bootstrap.data.user.activeSpaceId, {
          context: { allowedCrossSpaceIds: [], visibleWineId: null },
          locale: currentLocale(i18n.language),
          message: message.trim(),
          saveHistory: false,
          threadId: null,
        }),
      );
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="assistant-page">
      <header className="page-heading">
        <p className="eyebrow">{t("assistant.eyebrow")}</p>
        <h1>{t("assistant.title")}</h1>
        <p>{t("assistant.body")}</p>
      </header>

      <aside className="privacy-note">
        <strong>{t("assistant.privacyTitle")}</strong>
        <span>{t("assistant.privacyBody")}</span>
      </aside>

      <form className="assistant-composer" onSubmit={(event) => void submit(event)}>
        <label htmlFor="assistant-message">{t("assistant.messageLabel")}</label>
        <textarea
          disabled={sending}
          id="assistant-message"
          maxLength={500}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("assistant.messagePlaceholder")}
          rows={4}
          value={message}
        />
        <div className="assistant-composer__footer">
          <span>{t("assistant.activeSpaceOnly")}</span>
          <button className="primary-button" disabled={sending || message.trim().length === 0}>
            {sending ? t("assistant.sending") : t("assistant.sendAction")}
          </button>
        </div>
      </form>

      {error ? (
        <p className="form-error" role="alert">
          {t("assistant.error")}
        </p>
      ) : null}
      {response === null && !sending ? (
        <div className="empty-state">
          <h2>{t("assistant.emptyTitle")}</h2>
          <p>{t("assistant.emptyBody")}</p>
        </div>
      ) : null}
      {response === null ? null : <AssistantResult response={response} />}
    </section>
  );
}
