import type {
  SessionComparisonResponse,
  TastingSessionDetailResponse,
  WineSummary,
} from "@vadevi/contracts";
import { descriptorText, resolveSupportedLocale } from "@vadevi/i18n/runtime";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { offlineDatabase } from "../offline/database";
import { sessionsChangedEvent } from "../offline/events";
import { useOfflineSync } from "../offline/OfflineSyncContext";
import {
  cacheSessionDetail,
  queueSessionOrder,
  queueSessionWines,
  sessionSnapshotId,
} from "../offline/phase3";
import { getWineMemory } from "../services/api";
import { getSessionComparison, getTastingSession } from "../services/tasting";
import { useSession } from "../session/SessionContext";

type SessionWine = TastingSessionDetailResponse["data"]["wines"][number];
type ComparisonWine = SessionComparisonResponse["data"]["wines"][number];
type ComparisonParticipant = ComparisonWine["participants"][number];

export function SessionDetailPage() {
  const { i18n, t } = useTranslation();
  const { sessionId = "" } = useParams();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const { flush, refreshStatus, status } = useOfflineSync();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const locale = resolveSupportedLocale(i18n.language);
  const [detail, setDetail] = useState<TastingSessionDetailResponse | null>(null);
  const [comparison, setComparison] = useState<SessionComparisonResponse | null>(null);
  const [availableWines, setAvailableWines] = useState<WineSummary[]>([]);
  const [selectedWineIds, setSelectedWineIds] = useState<string[]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [error, setError] = useState(false);

  const loadCached = useCallback(
    async (showCacheNotice = true) => {
      if (userId.length === 0 || sessionId.length === 0) return;
      const snapshot = await offlineDatabase.tastingSessions.get(
        sessionSnapshotId(userId, spaceId, sessionId),
      );
      if (snapshot !== undefined) {
        setDetail(snapshot.detail);
        setComparison(snapshot.comparison);
        setUsingCache(showCacheNotice);
      }
    },
    [sessionId, spaceId, userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (user === null || !navigator.onLine) {
      queueMicrotask(() => void loadCached());
    } else {
      void getTastingSession(user, spaceId, sessionId, controller.signal)
        .then(async (response) => {
          const nextComparison = await getSessionComparison(
            user,
            spaceId,
            sessionId,
            controller.signal,
          ).catch(() => null);
          setDetail(response);
          setComparison(nextComparison);
          setUsingCache(false);
          await cacheSessionDetail(user.uid, spaceId, response, nextComparison);
        })
        .catch(() => loadCached());
    }
    return () => controller.abort();
  }, [loadCached, sessionId, spaceId, user]);

  useEffect(() => {
    const controller = new AbortController();
    const loadCachedWines = async () => {
      const snapshots = await offlineDatabase.snapshots
        .where("[userId+spaceId]")
        .equals([userId, spaceId])
        .toArray();
      setAvailableWines(snapshots.map((snapshot) => snapshot.wine));
    };
    if (user === null || !navigator.onLine) void loadCachedWines();
    else {
      void getWineMemory(user, spaceId, { limit: 100 }, controller.signal)
        .then((response) => setAvailableWines(response.data))
        .catch(loadCachedWines);
    }
    return () => controller.abort();
  }, [spaceId, user, userId]);

  useEffect(() => {
    const changed = (event: Event) => {
      const eventSpace = (event as CustomEvent<{ spaceId: string }>).detail.spaceId;
      if (eventSpace === spaceId) void loadCached(!navigator.onLine);
    };
    globalThis.addEventListener(sessionsChangedEvent, changed);
    return () => globalThis.removeEventListener(sessionsChangedEvent, changed);
  }, [loadCached, spaceId]);

  const winesNotInFlight = useMemo(() => {
    const used = new Set(detail?.data.wines.map((entry: SessionWine) => entry.wine.id) ?? []);
    return availableWines.filter((wine) => !used.has(wine.id));
  }, [availableWines, detail]);

  async function move(index: number, direction: -1 | 1) {
    if (detail === null || user === null) return;
    const target = index + direction;
    if (target < 0 || target >= detail.data.wines.length) return;
    const ordered = detail.data.wines.map((entry: SessionWine) => entry.id);
    const currentId = ordered[index];
    const targetId = ordered[target];
    if (currentId === undefined || targetId === undefined) return;
    ordered[index] = targetId;
    ordered[target] = currentId;
    setError(false);
    try {
      await queueSessionOrder({
        orderedSessionWineIds: ordered,
        sessionId,
        spaceId,
        userId: user.uid,
      });
      await refreshStatus();
      await loadCached();
      if (navigator.onLine) void flush(spaceId);
    } catch {
      setError(true);
    }
  }

  async function addSelected() {
    if (user === null) return;
    setError(false);
    try {
      await queueSessionWines({
        sessionId,
        spaceId,
        userId: user.uid,
        wines: winesNotInFlight.filter((wine) => selectedWineIds.includes(wine.id)),
      });
      setSelectedWineIds([]);
      await refreshStatus();
      await loadCached();
      if (navigator.onLine) void flush(spaceId);
    } catch {
      setError(true);
    }
  }

  if (detail === null) {
    return (
      <section className="sessions-page">
        <div className="empty-state">
          <h1>{t("sessions.loading")}</h1>
          <p>{t("sessions.loadingBody")}</p>
        </div>
      </section>
    );
  }

  const date = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(new Date(detail.data.session.startsAt));
  const comparisonByFlight = new Map<string, ComparisonWine>(
    comparison?.data.wines.map((entry: ComparisonWine) => [entry.sessionWineId, entry]) ?? [],
  );

  return (
    <section className="sessions-page">
      <header className="page-heading session-detail-heading">
        <div>
          <p className="eyebrow">{t(`sessions.status.${detail.data.session.status}`)}</p>
          <h1>{detail.data.session.name}</h1>
          <p>
            {date}
            {detail.data.session.venueText === null ? "" : ` · ${detail.data.session.venueText}`}
          </p>
        </div>
        <Link className="text-link" to="/sessions">
          {t("sessions.backAction")}
        </Link>
      </header>
      {usingCache ? (
        <p className="cache-note" role="status">
          {t("sessions.cached")}
        </p>
      ) : null}
      <p className="local-save-state" role="status">
        {t(`sync.${status}`)}
      </p>
      {error ? (
        <p className="form-error" role="alert">
          {t("sessions.saveError")}
        </p>
      ) : null}

      <section aria-labelledby="flight-heading" className="session-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("sessions.flightEyebrow")}</p>
            <h2 id="flight-heading">{t("sessions.flightTitle")}</h2>
          </div>
          <span>{t("sessions.wineCount", { count: detail.data.wines.length })}</span>
        </div>
        {detail.data.wines.length === 0 ? (
          <p>{t("sessions.emptyFlight")}</p>
        ) : (
          <ol className="flight-list">
            {detail.data.wines.map((entry: SessionWine, index: number) => {
              const compared = comparisonByFlight.get(entry.id);
              return (
                <li className="flight-card" key={entry.id}>
                  <span aria-hidden="true" className="flight-position">
                    {index + 1}
                  </span>
                  <div className="flight-card__wine">
                    <p>{entry.wine.producerName}</p>
                    <h3>{entry.wine.displayName}</h3>
                    <span>
                      {entry.wine.nonVintage ? "NV" : (entry.wine.vintageYear ?? "—")}
                      {entry.servingLabel === null ? "" : ` · ${entry.servingLabel}`}
                    </span>
                  </div>
                  <div className="flight-card__state">
                    <span>
                      {entry.ownNoteState === null
                        ? t("sessions.note.notStarted")
                        : t(`sessions.note.${entry.ownNoteState}`)}
                    </span>
                    <span>
                      {t("sessions.submissionCount", { count: entry.submittedNoteCount })}
                    </span>
                    {compared?.groupScore === null || compared === undefined ? null : (
                      <strong>{t("sessions.groupScore", { score: compared.groupScore })}</strong>
                    )}
                  </div>
                  <div className="flight-card__actions">
                    <button
                      aria-label={t("sessions.moveUpLabel", { wine: entry.wine.displayName })}
                      className="icon-button"
                      disabled={index === 0}
                      onClick={() => void move(index, -1)}
                      type="button"
                    >
                      ↑
                    </button>
                    <button
                      aria-label={t("sessions.moveDownLabel", { wine: entry.wine.displayName })}
                      className="icon-button"
                      disabled={index === detail.data.wines.length - 1}
                      onClick={() => void move(index, 1)}
                      type="button"
                    >
                      ↓
                    </button>
                    <Link
                      className="action-link action-link--primary"
                      to={`/wines/${entry.wine.id}/taste?sessionId=${sessionId}&sessionWineId=${entry.id}${entry.ownNoteId === null ? "" : `&noteId=${entry.ownNoteId}`}`}
                    >
                      {entry.ownNoteId === null
                        ? t("sessions.note.startAction")
                        : t("sessions.note.editAction")}
                    </Link>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {winesNotInFlight.length === 0 ? null : (
        <section aria-labelledby="add-wines-heading" className="session-section">
          <h2 id="add-wines-heading">{t("sessions.addWinesTitle")}</h2>
          <div className="wine-picker-grid">
            {winesNotInFlight.map((wine) => (
              <label className="wine-picker" key={wine.id}>
                <input
                  checked={selectedWineIds.includes(wine.id)}
                  onChange={(event) =>
                    setSelectedWineIds((current) =>
                      event.target.checked
                        ? [...current, wine.id]
                        : current.filter((id) => id !== wine.id),
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <strong>{wine.displayName}</strong>
                  <small>{wine.producerName}</small>
                </span>
              </label>
            ))}
          </div>
          <button
            className="primary-button"
            disabled={selectedWineIds.length === 0}
            onClick={() => void addSelected()}
            type="button"
          >
            {t("sessions.addWinesAction")}
          </button>
        </section>
      )}

      <section aria-labelledby="comparison-heading" className="session-section">
        <div className="section-heading-row">
          <div>
            <p className="eyebrow">{t("sessions.comparisonEyebrow")}</p>
            <h2 id="comparison-heading">{t("sessions.comparisonTitle")}</h2>
          </div>
          {comparison === null ? null : (
            <span>{t("sessions.algorithm", { version: comparison.data.algorithmVersion })}</span>
          )}
        </div>
        {comparison === null ||
        comparison.data.wines.every((wine: ComparisonWine) => wine.noteCount === 0) ? (
          <p>{t("sessions.comparisonEmpty")}</p>
        ) : (
          <div className="comparison-grid">
            {detail.data.wines.map((flight: SessionWine) => {
              const item = comparisonByFlight.get(flight.id);
              if (item === undefined || item.noteCount === 0) return null;
              return (
                <article
                  className="comparison-card"
                  data-divisive={comparison.data.mostDivisiveSessionWineId === flight.id}
                  key={flight.id}
                >
                  <div>
                    <p>{flight.wine.producerName}</p>
                    <h3>{flight.wine.displayName}</h3>
                  </div>
                  <dl>
                    <div>
                      <dt>{t("sessions.sampleSize")}</dt>
                      <dd>{item.noteCount}</dd>
                    </div>
                    <div>
                      <dt>{t("sessions.rank")}</dt>
                      <dd>{item.rank ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>{t("sessions.groupScoreLabel")}</dt>
                      <dd>
                        {item.groupScore === null ? t("sessions.notEnoughScores") : item.groupScore}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("sessions.buyAgain")}</dt>
                      <dd>{item.buyAgainCount}</dd>
                    </div>
                  </dl>
                  {item.descriptorOverlap.length === 0 ? null : (
                    <p>
                      {t("sessions.overlap", {
                        descriptors: item.descriptorOverlap
                          .map((code: string) => descriptorText(code, locale)?.label ?? code)
                          .join(", "),
                      })}
                    </p>
                  )}
                  {comparison.data.mostDivisiveSessionWineId === flight.id ? (
                    <span className="warning-chip">{t("sessions.mostDivisive")}</span>
                  ) : null}
                  <ul className="participant-list">
                    {item.participants.map((participant: ComparisonParticipant) => (
                      <li key={participant.authorUserId}>
                        <span>{participant.displayName}</span>
                        <strong>{participant.score100 ?? "—"}</strong>
                      </li>
                    ))}
                  </ul>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
