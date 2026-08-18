import type {
  ActionDraft,
  AssistantRecommendation,
  AssistantRenderedClaim,
  AssistantSearchResult,
  AssistantTurnResponse,
  AssistantWineComparison,
  Fact,
  PriceObservation,
  Source,
  SupportedLocale,
} from "@vadevi/contracts";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { createIdempotencyKey } from "../security/idempotency";
import { createUlid } from "../security/ulid";
import { createAssistantTurn } from "../services/assistant";
import { cancelActionDraft, confirmActionDraft, createActionDraft } from "../services/cellar";
import { useSession } from "../session/SessionContext";

/** The chat lives on the device for a quarter hour, then clears itself. */
const chatStorageKey = "vadevi.vicenc.chat.v1";
const chatTtlMs = 15 * 60 * 1_000;

type ChatTurn = {
  id: string;
  question: string;
  response: AssistantTurnResponse | null;
  status: "done" | "error" | "pending";
};

function loadChat(): ChatTurn[] {
  try {
    const raw = globalThis.localStorage?.getItem(chatStorageKey);
    if (raw === null || raw === undefined) return [];
    const parsed = JSON.parse(raw) as { savedAt: number; turns: ChatTurn[] };
    if (Date.now() - parsed.savedAt > chatTtlMs) {
      globalThis.localStorage?.removeItem(chatStorageKey);
      return [];
    }
    // A turn left mid-flight by a closed tab is shown as failed, never as still
    // thinking — nothing is in flight after a reload.
    return parsed.turns.map((turn) =>
      turn.status === "pending" ? { ...turn, status: "error" as const } : turn,
    );
  } catch {
    return [];
  }
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

function currentLocale(language: string): SupportedLocale {
  const candidate = language === "pt" ? "pt-PT" : language.split("-")[0];
  return supportedLocales.has(candidate as SupportedLocale) ? (candidate as SupportedLocale) : "en";
}

export function AssistantResult({
  drafting = false,
  onDraftWishlist,
  response,
}: {
  drafting?: boolean;
  onDraftWishlist?: (wineId: string, wineName: string) => void;
  response: AssistantTurnResponse;
}) {
  const { i18n, t } = useTranslation();
  return (
    <section aria-live="polite" className="assistant-response">
      {response.data.renderedClaims.length === 0 ? (
        <p className="assistant-response__text">{response.data.renderedText}</p>
      ) : (
        <div className="assistant-response__text">
          {response.data.renderedClaims.map((claim: AssistantRenderedClaim, index: number) => (
            <p key={`claim-${index}`}>{claim.text}</p>
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
                {onDraftWishlist === undefined ? null : (
                  <button
                    className="text-button"
                    disabled={drafting}
                    onClick={() => onDraftWishlist(result.wine.id, result.wine.displayName)}
                    type="button"
                  >
                    {t("actions.draftWishlist")}
                  </button>
                )}
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

      {response.data.recommendations.length === 0 ? null : (
        <div>
          <h2>{t("assistant.recommendationsTitle")}</h2>
          <p>{t("assistant.recommendationsBody")}</p>
          <div className="assistant-comparison-grid">
            {response.data.recommendations.map((recommendation: AssistantRecommendation) => (
              <article className="assistant-comparison-card" key={recommendation.wineId}>
                <p className="eyebrow">#{recommendation.rank}</p>
                <h3>{recommendation.wineName}</h3>
                <strong>{t(`assistant.recommendationLabel.${recommendation.label}`)}</strong>
                <ul>
                  {recommendation.reasonCodes.map((reason: string) => (
                    <li key={reason}>{t(`assistant.recommendationReason.${reason}`)}</li>
                  ))}
                </ul>
                <p>
                  {recommendation.sampleSize < 3
                    ? t("assistant.recommendationSampleInsufficient", {
                        count: recommendation.sampleSize,
                      })
                    : t("assistant.recommendationSample", {
                        count: recommendation.sampleSize,
                      })}
                </p>
                {recommendation.latestPrice === null ? null : (
                  <p>
                    {new Intl.NumberFormat(i18n.language, {
                      currency: recommendation.latestPrice.currency,
                      style: "currency",
                    }).format(recommendation.latestPrice.amountMinor / 100)}{" "}
                    · {t(`shop.sourceValue.${recommendation.latestPrice.sourceType}`)} ·{" "}
                    <time dateTime={recommendation.latestPrice.observedAt}>
                      {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                        new Date(recommendation.latestPrice.observedAt),
                      )}
                    </time>
                  </p>
                )}
                {onDraftWishlist === undefined ? null : (
                  <button
                    className="primary-button"
                    disabled={drafting}
                    onClick={() => onDraftWishlist(recommendation.wineId, recommendation.wineName)}
                    type="button"
                  >
                    {t("actions.draftWishlist")}
                  </button>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {response.data.priceObservations.length === 0 ? null : (
        <div>
          <h2>{t("assistant.pricesTitle")}</h2>
          <p>{t("assistant.pricesCoverage")}</p>
          <div className="price-grid">
            {response.data.priceObservations.map((price: PriceObservation) => (
              <article className="price-card" key={price.id}>
                <strong>
                  {new Intl.NumberFormat(i18n.language, {
                    currency: price.currency,
                    style: "currency",
                  }).format(price.amountMinor / 100)}
                </strong>
                <p>{price.merchantName ?? t("shop.merchantUnknown")}</p>
                <p>
                  {t(`shop.sourceValue.${price.sourceType}`)} ·{" "}
                  <time dateTime={price.observedAt}>
                    {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                      new Date(price.observedAt),
                    )}
                  </time>
                </p>
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
    </section>
  );
}

export function AssistantPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [message, setMessage] = useState("");
  const [turns, setTurns] = useState<ChatTurn[]>(() => loadChat());
  const [draft, setDraft] = useState<ActionDraft | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  // One question in flight at a time, so a second Enter cannot leave the first
  // hanging — the earlier version reused a single response slot and a fast
  // second ask sat there searching.
  const pending = turns.some((turn) => turn.status === "pending");

  useEffect(() => {
    if (turns.length === 0) {
      globalThis.localStorage?.removeItem(chatStorageKey);
      return;
    }
    // Saving on every change also refreshes the clock, so the quarter hour runs
    // from the last message, not the first.
    globalThis.localStorage?.setItem(
      chatStorageKey,
      JSON.stringify({ savedAt: Date.now(), turns: turns.slice(-12) }),
    );
  }, [turns]);

  useEffect(() => {
    threadRef.current?.scrollTo({ behavior: "smooth", top: threadRef.current.scrollHeight });
  }, [turns]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const question = message.trim();
    if (user === null || question.length === 0 || pending) return;
    const id = createUlid();
    setTurns((current) => [...current, { id, question, response: null, status: "pending" }]);
    setMessage("");
    try {
      const answer = await createAssistantTurn(user, bootstrap.data.user.activeSpaceId, {
        context: { allowedCrossSpaceIds: [], visibleWineId: null },
        locale: currentLocale(i18n.language),
        message: question,
        saveHistory: false,
        threadId: null,
      });
      setTurns((current) =>
        current.map((turn) =>
          turn.id === id ? { ...turn, response: answer, status: "done" } : turn,
        ),
      );
    } catch {
      setTurns((current) =>
        current.map((turn) => (turn.id === id ? { ...turn, status: "error" } : turn)),
      );
    }
  }

  function clearChat() {
    setTurns([]);
    setMessage("");
    globalThis.localStorage?.removeItem(chatStorageKey);
  }

  async function draftWishlist(wineId: string, wineName: string) {
    if (user === null || !navigator.onLine) return;
    setDrafting(true);
    setDraftError(false);
    try {
      const created = await createActionDraft(
        user,
        bootstrap.data.user.activeSpaceId,
        {
          action: "add_wishlist_item",
          payload: {
            priority: 2,
            reason: t("actions.assistantWishlistReason", { wine: wineName }),
            wineId,
          },
          summary: t("actions.assistantWishlistSummary", { wine: wineName }),
        },
        createIdempotencyKey(),
      );
      setDraft(created.data);
    } catch {
      setDraftError(true);
    } finally {
      setDrafting(false);
    }
  }

  async function confirmDraft() {
    if (user === null || draft === null) return;
    setDrafting(true);
    setDraftError(false);
    try {
      const confirmed = await confirmActionDraft(user, bootstrap.data.user.activeSpaceId, draft.id);
      setDraft(confirmed.data);
    } catch {
      setDraftError(true);
    } finally {
      setDrafting(false);
    }
  }

  async function cancelDraft() {
    if (user === null || draft === null) return;
    setDrafting(true);
    setDraftError(false);
    try {
      const canceled = await cancelActionDraft(user, bootstrap.data.user.activeSpaceId, draft.id);
      setDraft(canceled.data);
    } catch {
      setDraftError(true);
    } finally {
      setDrafting(false);
    }
  }

  return (
    <section className="assistant-page assistant-chat">
      <header className="page-heading assistant-chat__heading">
        <div>
          <p className="eyebrow">{t("assistant.eyebrow")}</p>
          <h1>{t("assistant.title")}</h1>
        </div>
        {turns.length === 0 ? null : (
          <button className="text-button" onClick={clearChat} type="button">
            {t("assistant.clearAction")}
          </button>
        )}
      </header>

      <p className="assistant-chat__note">{t("assistant.chatNote")}</p>

      <div className="assistant-thread" ref={threadRef}>
        {turns.length === 0 ? (
          <div className="empty-state">
            <h2>{t("assistant.emptyTitle")}</h2>
            <p>{t("assistant.emptyBody")}</p>
          </div>
        ) : (
          turns.map((turn) => (
            <div className="assistant-turn" key={turn.id}>
              <div className="chat-bubble chat-bubble--user">
                <p>{turn.question}</p>
              </div>
              <div className="chat-bubble chat-bubble--vicenc">
                {turn.status === "pending" ? (
                  <p className="chat-thinking" role="status">
                    {t("assistant.thinking")}
                  </p>
                ) : turn.status === "error" || turn.response === null ? (
                  <p className="form-error" role="alert">
                    {t("assistant.error")}
                  </p>
                ) : (
                  <AssistantResult
                    drafting={drafting}
                    onDraftWishlist={(wineId, wineName) => void draftWishlist(wineId, wineName)}
                    response={turn.response}
                  />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <form className="assistant-composer" onSubmit={(event) => void submit(event)}>
        <label className="sr-only" htmlFor="assistant-message">
          {t("assistant.messageLabel")}
        </label>
        <textarea
          id="assistant-message"
          maxLength={500}
          onChange={(event) => setMessage(event.target.value)}
          placeholder={t("assistant.messagePlaceholder")}
          rows={2}
          value={message}
        />
        <div className="assistant-composer__footer">
          <span>{t("assistant.activeSpaceOnly")}</span>
          <button className="primary-button" disabled={pending || message.trim().length === 0}>
            {pending ? t("assistant.sending") : t("assistant.sendAction")}
          </button>
        </div>
      </form>

      {draft === null ? null : (
        <section aria-live="polite" className="action-draft-card">
          <p className="eyebrow">{t("actions.reviewEyebrow")}</p>
          <h2>{t("actions.reviewTitle")}</h2>
          <p>{draft.summary ?? t("actions.contentCleared")}</p>
          <p>{t(`actions.state.${draft.state}`)}</p>
          {draft.state === "pending" ? (
            <div className="hero__actions">
              <button
                className="primary-button"
                disabled={drafting}
                onClick={() => void confirmDraft()}
                type="button"
              >
                {t("actions.confirm")}
              </button>
              <button
                className="action-link action-link--secondary"
                disabled={drafting}
                onClick={() => void cancelDraft()}
                type="button"
              >
                {t("actions.cancel")}
              </button>
            </div>
          ) : null}
          {draft.state === "confirmed" ? (
            <Link to="/wishlist">{t("actions.openWishlist")}</Link>
          ) : null}
          {draftError ? <p className="form-error">{t("actions.error")}</p> : null}
        </section>
      )}
    </section>
  );
}
