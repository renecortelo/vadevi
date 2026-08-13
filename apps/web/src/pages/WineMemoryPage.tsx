import type { TastingSessionResponse, WineSummary } from "@vadevi/contracts";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { offlineDatabase, type SyncConflict } from "../offline/database";
import { memoryChangedEvent, sessionsChangedEvent } from "../offline/events";
import { useOfflineSync } from "../offline/OfflineSyncContext";
import { createUlid } from "../security/ulid";
import { getPrivateMedia, getWineMemory } from "../services/api";
import { useSession } from "../session/SessionContext";

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function duplicateKey(wine: WineSummary): string {
  return [
    normalize(wine.producerName),
    normalize(wine.displayName),
    wine.nonVintage ? "NV" : (wine.vintageYear ?? ""),
  ].join("|");
}

function PrivateWineImage({
  mediaId,
  name,
  spaceId,
}: {
  mediaId: string;
  name: string;
  spaceId: string;
}) {
  const { user } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (user === null || !navigator.onLine) return;
    const controller = new AbortController();
    let objectUrl: string | null = null;
    void getPrivateMedia(user, spaceId, mediaId, controller.signal)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => undefined);
    return () => {
      controller.abort();
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaId, spaceId, user]);
  return url === null ? (
    <div aria-hidden="true" className="wine-card__placeholder">
      V
    </div>
  ) : (
    <img alt={name} src={url} />
  );
}

function ConflictPanel({
  conflicts,
  onChanged,
}: {
  conflicts: SyncConflict[];
  onChanged: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { flush } = useOfflineSync();

  async function keepServer(conflict: SyncConflict) {
    await offlineDatabase.transaction(
      "rw",
      offlineDatabase.conflicts,
      offlineDatabase.mutations,
      async () => {
        await offlineDatabase.conflicts.delete(conflict.id);
        await offlineDatabase.mutations.delete(conflict.id);
      },
    );
    await onChanged();
  }

  async function saveAsCopy(conflict: SyncConflict) {
    const mutation = await offlineDatabase.mutations.get(conflict.id);
    if (mutation === undefined) return;
    const nextResourceId = createUlid();
    const nextMutationId = createUlid();
    await offlineDatabase.transaction(
      "rw",
      offlineDatabase.conflicts,
      offlineDatabase.mutations,
      async () => {
        if (mutation.resourceType === "wine_record") {
          const related = await offlineDatabase.mutations
            .where("[userId+spaceId]")
            .equals([mutation.userId, mutation.spaceId])
            .filter(
              (candidate) =>
                candidate.resourceType === "tasting_note" &&
                candidate.payload.wineId === mutation.resourceId,
            )
            .toArray();
          await offlineDatabase.mutations.bulkPut(
            related.map((candidate) => ({
              ...candidate,
              payload: { ...candidate.payload, wineId: nextResourceId },
            })),
          );
        }
        await offlineDatabase.mutations.delete(mutation.id);
        const retryable = { ...mutation };
        delete retryable.lastError;
        await offlineDatabase.mutations.put({
          ...retryable,
          id: nextMutationId,
          resourceId: nextResourceId,
          state: "queued",
        });
        await offlineDatabase.conflicts.delete(conflict.id);
      },
    );
    await onChanged();
    void flush(conflict.spaceId);
  }

  if (conflicts.length === 0) return null;
  return (
    <section aria-labelledby="conflict-title" className="attention-panel">
      <h2 id="conflict-title">{t("memory.conflictTitle")}</h2>
      <p>{t("memory.conflictBody")}</p>
      {conflicts.map((conflict) => (
        <article className="conflict-card" key={conflict.id}>
          <div>
            <h3>{t("memory.localVersion")}</h3>
            <pre>{JSON.stringify(conflict.localPayload, null, 2)}</pre>
          </div>
          <div>
            <h3>{t("memory.serverVersion")}</h3>
            <pre>
              {JSON.stringify(conflict.serverPayload ?? t("memory.serverUnavailable"), null, 2)}
            </pre>
          </div>
          <div className="hero__actions">
            <button
              className="primary-button"
              onClick={() => void saveAsCopy(conflict)}
              type="button"
            >
              {t("memory.saveCopy")}
            </button>
            <button
              className="action-link action-link--secondary"
              onClick={() => void keepServer(conflict)}
              type="button"
            >
              {t("memory.keepServer")}
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}

export function WineMemoryPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const { clearOfflineData, flush, pendingCount, refreshStatus, status } = useOfflineSync();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const [wines, setWines] = useState<WineSummary[]>([]);
  const [query, setQuery] = useState("");
  const [wineType, setWineType] = useState("");
  const [view, setView] = useState<"cards" | "sessions" | "table" | "timeline">("cards");
  const [sessions, setSessions] = useState<TastingSessionResponse["data"][]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);

  const loadSessionCache = useCallback(async () => {
    if (userId.length === 0) return;
    const snapshots = await offlineDatabase.tastingSessions
      .where("[userId+spaceId]")
      .equals([userId, spaceId])
      .toArray();
    setSessions(
      snapshots
        .map((snapshot) => snapshot.detail.data.session)
        .sort((left, right) => right.startsAt.localeCompare(left.startsAt)),
    );
  }, [spaceId, userId]);

  const loadLocal = useCallback(
    async (showCacheNotice = true) => {
      if (userId.length === 0) return;
      const [snapshots, nextConflicts] = await Promise.all([
        offlineDatabase.snapshots.where("[userId+spaceId]").equals([userId, spaceId]).toArray(),
        offlineDatabase.conflicts.where("[userId+spaceId]").equals([userId, spaceId]).toArray(),
      ]);
      const normalizedQuery = normalize(query);
      setWines(
        snapshots
          .map((snapshot) => snapshot.wine)
          .filter(
            (wine) =>
              (normalizedQuery.length === 0 ||
                normalize(`${wine.producerName} ${wine.displayName}`).includes(normalizedQuery)) &&
              (wineType.length === 0 || wine.wineType === wineType),
          ),
      );
      setConflicts(nextConflicts);
      setUsingCache(showCacheNotice);
    },
    [query, spaceId, userId, wineType],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => {
      if (user === null || !navigator.onLine) {
        void loadLocal();
        return;
      }
      void getWineMemory(
        user,
        spaceId,
        { limit: 100, query, ...(wineType.length === 0 ? {} : { wineType }) },
        controller.signal,
      )
        .then((response) => {
          setWines(response.data);
          setUsingCache(false);
        })
        .catch(() => loadLocal());
      void offlineDatabase.conflicts
        .where("[userId+spaceId]")
        .equals([user.uid, spaceId])
        .toArray()
        .then(setConflicts);
    }, 200);
    return () => {
      controller.abort();
      globalThis.clearTimeout(timeout);
    };
  }, [loadLocal, query, spaceId, user, wineType]);

  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ spaceId: string }>).detail;
      if (detail.spaceId === spaceId) {
        void loadLocal(!navigator.onLine);
        void loadSessionCache();
      }
    };
    globalThis.addEventListener(memoryChangedEvent, changed);
    globalThis.addEventListener(sessionsChangedEvent, changed);
    return () => {
      globalThis.removeEventListener(memoryChangedEvent, changed);
      globalThis.removeEventListener(sessionsChangedEvent, changed);
    };
  }, [loadLocal, loadSessionCache, spaceId]);

  useEffect(() => {
    queueMicrotask(() => void loadSessionCache());
  }, [loadSessionCache]);

  const duplicateCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wine of wines)
      counts.set(duplicateKey(wine), (counts.get(duplicateKey(wine)) ?? 0) + 1);
    return counts;
  }, [wines]);

  async function clearData() {
    await clearOfflineData();
    setWines([]);
    setConflicts([]);
    setConfirmClear(false);
  }

  return (
    <section className="memory-page">
      <header className="page-heading memory-heading">
        <div>
          <p className="eyebrow">{t("memory.eyebrow")}</p>
          <h1>{t("memory.title")}</h1>
          <p>{t("memory.body")}</p>
        </div>
        <div aria-label={t("memory.viewLabel")} className="segmented-control" role="group">
          <button aria-pressed={view === "cards"} onClick={() => setView("cards")} type="button">
            {t("memory.cards")}
          </button>
          <button aria-pressed={view === "table"} onClick={() => setView("table")} type="button">
            {t("memory.table")}
          </button>
          <button
            aria-pressed={view === "timeline"}
            onClick={() => setView("timeline")}
            type="button"
          >
            {t("memory.timeline")}
          </button>
          <button
            aria-pressed={view === "sessions"}
            onClick={() => setView("sessions")}
            type="button"
          >
            {t("memory.sessions")}
          </button>
        </div>
      </header>

      <section aria-label={t("memory.syncLabel")} className="memory-sync-bar" data-state={status}>
        <div>
          <strong>{t(`sync.${status}`)}</strong>
          <span>
            {pendingCount > 0
              ? t("memory.pending", { count: pendingCount })
              : t("memory.noPending")}
          </span>
        </div>
        <div className="hero__actions">
          <button className="text-button" onClick={() => void flush(spaceId)} type="button">
            {t("memory.retrySync")}
          </button>
          <button
            className="text-button text-button--danger"
            onClick={() => setConfirmClear(true)}
            type="button"
          >
            {t("memory.clearOffline")}
          </button>
        </div>
      </section>
      {confirmClear ? (
        <div className="clear-confirm" role="alert">
          <p>{t("memory.clearConfirm")}</p>
          <div className="hero__actions">
            <button className="primary-button" onClick={() => void clearData()} type="button">
              {t("memory.clearAction")}
            </button>
            <button
              className="action-link action-link--secondary"
              onClick={() => setConfirmClear(false)}
              type="button"
            >
              {t("spaces.cancelAction")}
            </button>
          </div>
        </div>
      ) : null}

      <ConflictPanel
        conflicts={conflicts}
        onChanged={async () => {
          await refreshStatus();
          await loadLocal();
        }}
      />

      <div className="memory-filters">
        <label>
          <span>{t("memory.search")}</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("memory.searchPlaceholder")}
            type="search"
            value={query}
          />
        </label>
        <label>
          <span>{t("memory.typeFilter")}</span>
          <select onChange={(event) => setWineType(event.target.value)} value={wineType}>
            <option value="">{t("memory.allTypes")}</option>
            {(["red", "white", "rose", "sparkling", "fortified", "orange", "other"] as const).map(
              (type) => (
                <option key={type} value={type}>
                  {t(`quickLog.wineType.${type}`)}
                </option>
              ),
            )}
          </select>
        </label>
      </div>

      {usingCache ? (
        <p className="cache-note" role="status">
          {t("memory.cached")}
        </p>
      ) : null}
      {view !== "sessions" && wines.length === 0 ? (
        <div className="empty-state">
          <h2>{t("memory.emptyTitle")}</h2>
          <p>{t("memory.emptyBody")}</p>
          <Link className="action-link action-link--primary" to="/log/new">
            {t("quickLog.title")}
          </Link>
        </div>
      ) : null}

      {view === "cards" && wines.length > 0 ? (
        <div className="wine-card-grid">
          {wines.map((wine) => (
            <article className="wine-card" key={wine.id}>
              <div className="wine-card__image">
                {wine.mediaId === null ? (
                  <div aria-hidden="true" className="wine-card__placeholder">
                    V
                  </div>
                ) : (
                  <PrivateWineImage
                    mediaId={wine.mediaId}
                    name={`${wine.producerName} ${wine.displayName}`}
                    spaceId={spaceId}
                  />
                )}
              </div>
              <div className="wine-card__body">
                {(duplicateCounts.get(duplicateKey(wine)) ?? 0) > 1 ? (
                  <span className="warning-chip">{t("memory.possibleDuplicate")}</span>
                ) : null}
                <p className="wine-card__producer">{wine.producerName}</p>
                <h2>{wine.displayName}</h2>
                <p>
                  {wine.nonVintage ? t("quickLog.nonVintageShort") : (wine.vintageYear ?? "—")}
                  {wine.region === null ? "" : ` · ${wine.region}`}
                </p>
                <div className="wine-card__facts">
                  <span>
                    {wine.score100 === null ? t("memory.notRated") : `${wine.score100}/100`}
                  </span>
                  <span>{t("memory.noteCount", { count: wine.noteCount })}</span>
                </div>
                <Link className="text-link" to={`/wines/${wine.id}/taste`}>
                  {t("tasting.startAction")}
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {view === "table" && wines.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("quickLog.producer")}</th>
                <th>{t("quickLog.wineName")}</th>
                <th>{t("quickLog.vintage")}</th>
                <th>{t("quickLog.type")}</th>
                <th>{t("quickLog.region")}</th>
                <th>{t("quickLog.score")}</th>
                <th>{t("memory.notes")}</th>
                <th>{t("tasting.startAction")}</th>
              </tr>
            </thead>
            <tbody>
              {wines.map((wine) => (
                <tr key={wine.id}>
                  <td>{wine.producerName}</td>
                  <td>
                    {wine.displayName}
                    {(duplicateCounts.get(duplicateKey(wine)) ?? 0) > 1 ? (
                      <span className="sr-only"> {t("memory.possibleDuplicate")}</span>
                    ) : null}
                  </td>
                  <td>
                    {wine.nonVintage ? t("quickLog.nonVintageShort") : (wine.vintageYear ?? "—")}
                  </td>
                  <td>{wine.wineType === null ? "—" : t(`quickLog.wineType.${wine.wineType}`)}</td>
                  <td>{wine.region ?? "—"}</td>
                  <td>{wine.score100 ?? "—"}</td>
                  <td>{wine.noteCount}</td>
                  <td>
                    <Link className="text-link" to={`/wines/${wine.id}/taste`}>
                      {t("tasting.startAction")}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {view === "timeline" && wines.length > 0 ? (
        <ol className="memory-timeline">
          {[...wines]
            .sort((left, right) =>
              (right.lastTastedAt ?? right.createdAt).localeCompare(
                left.lastTastedAt ?? left.createdAt,
              ),
            )
            .map((wine) => {
              const timestamp = wine.lastTastedAt ?? wine.createdAt;
              return (
                <li key={wine.id}>
                  <time dateTime={timestamp}>
                    {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                      new Date(timestamp),
                    )}
                  </time>
                  <div>
                    <p>{wine.producerName}</p>
                    <h2>{wine.displayName}</h2>
                    <span>
                      {wine.lastTastedAt === null
                        ? t("memory.loggedOnly")
                        : t("memory.noteCount", { count: wine.noteCount })}
                    </span>
                  </div>
                  <Link className="text-link" to={`/wines/${wine.id}/taste`}>
                    {t("tasting.startAction")}
                  </Link>
                </li>
              );
            })}
        </ol>
      ) : null}

      {view === "sessions" ? (
        sessions.length === 0 ? (
          <div className="empty-state">
            <h2>{t("memory.noSessionsTitle")}</h2>
            <p>{t("memory.noSessionsBody")}</p>
            <Link className="action-link action-link--primary" to="/sessions/new">
              {t("sessions.newAction")}
            </Link>
          </div>
        ) : (
          <div className="session-card-grid">
            {sessions.map((session) => (
              <article className="session-card" key={session.id}>
                <time dateTime={session.startsAt}>
                  {new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(
                    new Date(session.startsAt),
                  )}
                </time>
                <h2>{session.name}</h2>
                <p>{t("sessions.wineCount", { count: session.wineCount })}</p>
                <Link className="text-link" to={`/sessions/${session.id}`}>
                  {t("sessions.openAction")}
                </Link>
              </article>
            ))}
          </div>
        )
      ) : null}
    </section>
  );
}
