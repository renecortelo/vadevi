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
import { mergeWines } from "../services/data-rights";
import { EditWineDialog } from "../components/EditWineDialog";
import { useSession } from "../session/SessionContext";

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The MVP filter surface. Server-side filtering keeps pagination stable, and
 * the same predicates run against the offline snapshot so a cached view does
 * not silently ignore the filters the user set.
 */
type MemoryFilterState = {
  countryCode: string;
  grape: string;
  hasMedia: string;
  maxScore: string;
  minScore: string;
  region: string;
  sentiment: string;
  sort: string;
  vintageFrom: string;
  vintageTo: string;
};

const emptyFilters: MemoryFilterState = {
  countryCode: "",
  grape: "",
  hasMedia: "",
  maxScore: "",
  minScore: "",
  region: "",
  sentiment: "",
  sort: "recent",
  vintageFrom: "",
  vintageTo: "",
};

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
    <div className="wine-card__placeholder">{name}</div>
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
        // Discarding a wine has to discard the notes that name it. Left behind
        // they can never be sent — the wine they point at will not exist — and
        // nothing surfaces them, so the queue would show a count that no
        // amount of syncing could clear.
        if (conflict.resourceType === "wine_record") {
          const orphaned = await offlineDatabase.mutations
            .where("[userId+spaceId]")
            .equals([conflict.userId, conflict.spaceId])
            .filter(
              (candidate) =>
                candidate.resourceType === "tasting_note" &&
                candidate.payload.wineId === conflict.resourceId,
            )
            .primaryKeys();
          await offlineDatabase.mutations.bulkDelete(orphaned);
        }
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
            related.map((candidate) => {
              // A note whose wine was held back was held back with it, so
              // releasing the wine has to release the note too — otherwise it
              // stays behind, unqueued and with nothing left to surface it.
              const released = { ...candidate };
              delete released.lastError;
              return {
                ...released,
                payload: { ...candidate.payload, wineId: nextResourceId },
                state: "queued" as const,
              };
            }),
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

/** The table columns a reader can order by; actions is not one. */
type SortColumn =
  "displayName" | "noteCount" | "producerName" | "region" | "score100" | "vintageYear" | "wineType";

type TableSort = { column: SortColumn; direction: "asc" | "desc" };

/**
 * A wine's value for one column, and whether it is empty. Empty cells sort last
 * in both directions — a wine with no score belongs at the bottom whether the
 * column is climbing or falling, not jumping to the top when it flips.
 */
function sortValue(
  wine: WineSummary,
  column: SortColumn,
  typeLabel: (wine: WineSummary) => string,
): { empty: boolean; value: number | string } {
  switch (column) {
    case "producerName":
      return { empty: false, value: wine.producerName };
    case "displayName":
      return { empty: false, value: wine.displayName };
    case "region":
      return { empty: wine.region === null, value: wine.region ?? "" };
    case "wineType":
      return { empty: wine.wineType === null, value: typeLabel(wine) };
    case "vintageYear":
      // A non-vintage wine has a real, orderable answer — it is just not a year.
      // Give it the lowest year so it groups at one end rather than as a gap.
      return wine.nonVintage
        ? { empty: false, value: -1 }
        : { empty: wine.vintageYear === null, value: wine.vintageYear ?? 0 };
    case "score100":
      return { empty: wine.score100 === null, value: wine.score100 ?? 0 };
    case "noteCount":
      return { empty: false, value: wine.noteCount };
  }
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
  const [filters, setFilters] = useState<MemoryFilterState>(emptyFilters);
  // Sort order is excluded on purpose: it reorders the list but never hides a
  // wine, so counting it would overstate how narrow the view is.
  const activeFilterCount =
    Object.entries(filters).filter(([key, value]) => key !== "sort" && value.length > 0).length +
    (wineType.length > 0 ? 1 : 0);
  const [mergePlan, setMergePlan] = useState<{ source: WineSummary; target: WineSummary } | null>(
    null,
  );
  const [mergeStatus, setMergeStatus] = useState<"error" | "merged" | null>(null);
  const [view, setView] = useState<"cards" | "sessions" | "table" | "timeline">("cards");
  const [sessions, setSessions] = useState<TastingSessionResponse["data"][]>([]);
  const [usingCache, setUsingCache] = useState(false);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const [confirmClear, setConfirmClear] = useState(false);
  const [editing, setEditing] = useState<WineSummary | null>(null);
  // Bumped after a correction. The list is fetched by an effect keyed on the
  // filters, so this is how a change made on this screen asks for it again.
  const [reloadToken, setReloadToken] = useState(0);
  // The table lets a reader order by any column, on top of whatever order the
  // list arrived in. It sorts what is loaded rather than asking the server, so
  // it stays instant and works offline; the dropdown still decides the fetch.
  const [tableSort, setTableSort] = useState<TableSort | null>(null);

  const typeLabel = useCallback(
    (wine: WineSummary) => (wine.wineType === null ? "" : t(`quickLog.wineType.${wine.wineType}`)),
    [t],
  );

  const sortedWines = useMemo(() => {
    if (tableSort === null) return wines;
    const collator = new Intl.Collator(i18n.language, { numeric: true, sensitivity: "base" });
    return [...wines].sort((left, right) => {
      const a = sortValue(left, tableSort.column, typeLabel);
      const b = sortValue(right, tableSort.column, typeLabel);
      if (a.empty !== b.empty) return a.empty ? 1 : -1;
      if (a.empty && b.empty) return 0;
      const cmp =
        typeof a.value === "number" && typeof b.value === "number"
          ? a.value - b.value
          : collator.compare(String(a.value), String(b.value));
      return tableSort.direction === "asc" ? cmp : -cmp;
    });
  }, [tableSort, wines, i18n.language, typeLabel]);

  const toggleSort = useCallback((column: SortColumn) => {
    setTableSort((current) =>
      current?.column === column
        ? { column, direction: current.direction === "asc" ? "desc" : "asc" }
        : { column, direction: "asc" },
    );
  }, []);

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
      const normalizedRegion = normalize(filters.region);
      setWines(
        snapshots
          .map((snapshot) => snapshot.wine)
          .filter(
            (wine) =>
              (normalizedQuery.length === 0 ||
                normalize(`${wine.producerName} ${wine.displayName}`).includes(normalizedQuery)) &&
              (wineType.length === 0 || wine.wineType === wineType) &&
              (filters.countryCode.length === 0 ||
                wine.countryCode?.toUpperCase() === filters.countryCode.toUpperCase()) &&
              (normalizedRegion.length === 0 ||
                normalize(wine.region ?? "").includes(normalizedRegion)) &&
              (filters.vintageFrom.length === 0 ||
                (wine.vintageYear ?? 0) >= Number(filters.vintageFrom)) &&
              (filters.vintageTo.length === 0 ||
                (wine.vintageYear ?? 0) <= Number(filters.vintageTo)) &&
              (filters.minScore.length === 0 ||
                (wine.score100 ?? -1) >= Number(filters.minScore)) &&
              (filters.maxScore.length === 0 ||
                (wine.score100 ?? Number.POSITIVE_INFINITY) <= Number(filters.maxScore)) &&
              (filters.hasMedia.length === 0 ||
                (filters.hasMedia === "true") === (wine.mediaId !== null)),
          ),
      );
      setConflicts(nextConflicts);
      setUsingCache(showCacheNotice);
    },
    [filters, query, spaceId, userId, wineType],
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
        {
          limit: 100,
          query,
          ...(wineType.length === 0 ? {} : { wineType }),
          ...Object.fromEntries(Object.entries(filters).filter(([, value]) => value.length > 0)),
        },
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
  }, [filters, loadLocal, query, reloadToken, spaceId, user, wineType]);

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

  /**
   * Duplicate candidates are surfaced for review, never merged automatically.
   * The record with the most notes is proposed as the survivor so the merge
   * moves the smaller history.
   */
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, WineSummary[]>();
    for (const wine of wines) {
      const key = duplicateKey(wine);
      groups.set(key, [...(groups.get(key) ?? []), wine]);
    }
    return [...groups.values()]
      .filter((group) => group.length > 1)
      .map((group) => [...group].sort((left, right) => right.noteCount - left.noteCount));
  }, [wines]);

  async function confirmMerge() {
    if (mergePlan === null || user === null) return;
    setMergeStatus(null);
    try {
      await mergeWines(user, spaceId, mergePlan.target.id, {
        confirm: true,
        sourceVersion: mergePlan.source.version,
        sourceWineId: mergePlan.source.id,
        targetVersion: mergePlan.target.version,
      });
      setMergePlan(null);
      setMergeStatus("merged");
      const response = await getWineMemory(user, spaceId, { limit: 100 });
      setWines(response.data);
    } catch {
      setMergeStatus("error");
    }
  }

  async function clearData() {
    await clearOfflineData();
    setConflicts([]);
    setConfirmClear(false);
    // Clearing empties the cached copy on this device, not the Space on the
    // server. Re-run the loader rather than blanking the list, so what is still
    // synced comes straight back instead of looking deleted until the next
    // visit. Offline, the loader reads the now-empty cache, which is the honest
    // state until the connection returns.
    setReloadToken((current) => current + 1);
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

      {editing === null ? null : (
        <EditWineDialog
          onClose={() => setEditing(null)}
          onSaved={() => {
            setReloadToken((current) => current + 1);
          }}
          wine={editing}
        />
      )}

      <ConflictPanel
        conflicts={conflicts}
        onChanged={async () => {
          await refreshStatus();
          await loadLocal();
        }}
      />

      {/*
        Only the free-text search stays open. The eleven refinements below it
        pushed the wines themselves off the first screen, which inverted the
        point of the page: this is a place to look at what you drank, not a place
        to fill in a form. They collapse by default, and the summary reports how
        many are active so a narrowed list is never silently narrowed.
      */}
      <div className="memory-filters">
        <label className="memory-filters__search">
          <span>{t("memory.search")}</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("memory.searchPlaceholder")}
            type="search"
            value={query}
          />
        </label>

        <details className="memory-filters__refine">
          <summary>
            <span>{t("memory.refineAction")}</span>
            {activeFilterCount > 0 ? (
              <span className="filter-count">
                {t("memory.activeFilters", { count: activeFilterCount })}
              </span>
            ) : null}
          </summary>

          <div className="memory-filters__grid">
            <label>
              <span>{t("memory.typeFilter")}</span>
              <select onChange={(event) => setWineType(event.target.value)} value={wineType}>
                <option value="">{t("memory.allTypes")}</option>
                {(
                  ["red", "white", "rose", "sparkling", "fortified", "orange", "other"] as const
                ).map((type) => (
                  <option key={type} value={type}>
                    {t(`quickLog.wineType.${type}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("memory.countryFilter")}</span>
              <input
                maxLength={2}
                onChange={(event) => setFilters({ ...filters, countryCode: event.target.value })}
                placeholder={t("memory.countryPlaceholder")}
                value={filters.countryCode}
              />
            </label>
            <label>
              <span>{t("memory.regionFilter")}</span>
              <input
                onChange={(event) => setFilters({ ...filters, region: event.target.value })}
                value={filters.region}
              />
            </label>
            <label>
              <span>{t("memory.grapeFilter")}</span>
              <input
                onChange={(event) => setFilters({ ...filters, grape: event.target.value })}
                value={filters.grape}
              />
            </label>
            <label>
              <span>{t("memory.vintageFrom")}</span>
              <input
                inputMode="numeric"
                onChange={(event) => setFilters({ ...filters, vintageFrom: event.target.value })}
                value={filters.vintageFrom}
              />
            </label>
            <label>
              <span>{t("memory.vintageTo")}</span>
              <input
                inputMode="numeric"
                onChange={(event) => setFilters({ ...filters, vintageTo: event.target.value })}
                value={filters.vintageTo}
              />
            </label>
            <label>
              <span>{t("memory.minScore")}</span>
              <input
                inputMode="numeric"
                onChange={(event) => setFilters({ ...filters, minScore: event.target.value })}
                value={filters.minScore}
              />
            </label>
            <label>
              <span>{t("memory.maxScore")}</span>
              <input
                inputMode="numeric"
                onChange={(event) => setFilters({ ...filters, maxScore: event.target.value })}
                value={filters.maxScore}
              />
            </label>
            <label>
              <span>{t("memory.sentimentFilter")}</span>
              <select
                onChange={(event) => setFilters({ ...filters, sentiment: event.target.value })}
                value={filters.sentiment}
              >
                <option value="">{t("memory.anySentiment")}</option>
                {(["like", "neutral", "dislike"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`memory.sentimentOption.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("memory.mediaFilter")}</span>
              <select
                onChange={(event) => setFilters({ ...filters, hasMedia: event.target.value })}
                value={filters.hasMedia}
              >
                <option value="">{t("memory.anyMedia")}</option>
                <option value="true">{t("memory.withMedia")}</option>
                <option value="false">{t("memory.withoutMedia")}</option>
              </select>
            </label>
            <label>
              <span>{t("memory.sortLabel")}</span>
              <select
                onChange={(event) => setFilters({ ...filters, sort: event.target.value })}
                value={filters.sort}
              >
                {(["recent", "tasted", "score", "name"] as const).map((value) => (
                  <option key={value} value={value}>
                    {t(`memory.sort.${value}`)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="text-button"
              onClick={() => {
                setFilters(emptyFilters);
                setWineType("");
              }}
              type="button"
            >
              {t("memory.clearFilters")}
            </button>
          </div>
        </details>
      </div>

      {duplicateGroups.length > 0 ? (
        <section aria-labelledby="duplicate-title" className="attention-panel">
          <h2 id="duplicate-title">{t("memory.duplicateTitle")}</h2>
          <p>{t("memory.duplicateBody")}</p>
          {duplicateGroups.map(([target, ...others]) => (
            <article className="conflict-card" key={target.id}>
              <div>
                <h3>{t("memory.keepRecord")}</h3>
                <p>
                  {target.producerName} — {target.displayName}
                </p>
                <p>{t("memory.noteCount", { count: target.noteCount })}</p>
              </div>
              {others.map((source) => (
                <div key={source.id}>
                  <h3>{t("memory.duplicateRecord")}</h3>
                  <p>
                    {source.producerName} — {source.displayName}
                  </p>
                  <p>{t("memory.noteCount", { count: source.noteCount })}</p>
                  <button
                    className="text-button"
                    onClick={() => setMergePlan({ source, target })}
                    type="button"
                  >
                    {t("memory.mergeAction")}
                  </button>
                </div>
              ))}
            </article>
          ))}
        </section>
      ) : null}

      {mergePlan === null ? null : (
        <div aria-labelledby="merge-confirm-title" className="clear-confirm" role="alertdialog">
          <h2 id="merge-confirm-title">{t("memory.mergeConfirmTitle")}</h2>
          <p>
            {t("memory.mergeConfirmBody", {
              source: `${mergePlan.source.producerName} ${mergePlan.source.displayName}`,
              target: `${mergePlan.target.producerName} ${mergePlan.target.displayName}`,
            })}
          </p>
          <div className="hero__actions">
            <button className="primary-button" onClick={() => void confirmMerge()} type="button">
              {t("memory.mergeConfirmAction")}
            </button>
            <button
              className="action-link action-link--secondary"
              onClick={() => setMergePlan(null)}
              type="button"
            >
              {t("spaces.cancelAction")}
            </button>
          </div>
        </div>
      )}
      {mergeStatus === "merged" ? <p role="status">{t("memory.mergeDone")}</p> : null}
      {mergeStatus === "error" ? (
        <p className="form-error" role="alert">
          {t("memory.mergeError")}
        </p>
      ) : null}

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
                  // No photograph: the wine's own name is more use than a
                  // letter that is identical on every card.
                  <div className="wine-card__placeholder">
                    {wine.producerName} · {wine.displayName}
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
                <div className="wine-card__actions">
                  {/* A wine logged in a hurry is a wine worth correcting. */}
                  <button className="text-button" onClick={() => setEditing(wine)} type="button">
                    {t("memory.editAction")}
                  </button>
                  <Link className="text-link" to={`/wines/${wine.id}/evidence`}>
                    {t("evidence.openAction")}
                  </Link>
                  <Link className="text-link" to={`/wines/${wine.id}/taste`}>
                    {t("tasting.startAction")}
                  </Link>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {view === "table" && wines.length > 0 ? (
        <div aria-label={t("memory.table")} className="table-scroll" role="region" tabIndex={0}>
          <table>
            <thead>
              <tr>
                {(
                  [
                    ["producerName", "quickLog.producer"],
                    ["displayName", "quickLog.wineName"],
                    ["vintageYear", "quickLog.vintage"],
                    ["wineType", "quickLog.type"],
                    ["region", "quickLog.region"],
                    ["score100", "quickLog.score"],
                    ["noteCount", "memory.notes"],
                  ] as const
                ).map(([column, labelKey]) => {
                  const active = tableSort?.column === column;
                  return (
                    <th
                      aria-sort={
                        active
                          ? tableSort.direction === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                      }
                      key={column}
                    >
                      <button className="th-sort" onClick={() => toggleSort(column)} type="button">
                        {t(labelKey)}
                        <span aria-hidden="true" className="th-sort__arrow">
                          {active ? (tableSort.direction === "asc" ? "▲" : "▼") : "↕"}
                        </span>
                      </button>
                    </th>
                  );
                })}
                <th>{t("memory.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {sortedWines.map((wine) => (
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
                    <div className="table-actions">
                      <Link className="text-link" to={`/wines/${wine.id}/evidence`}>
                        {t("evidence.openAction")}
                      </Link>
                      <Link className="text-link" to={`/wines/${wine.id}/taste`}>
                        {t("tasting.startAction")}
                      </Link>
                    </div>
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
                  <div className="table-actions">
                    <Link className="text-link" to={`/wines/${wine.id}/evidence`}>
                      {t("evidence.openAction")}
                    </Link>
                    <Link className="text-link" to={`/wines/${wine.id}/taste`}>
                      {t("tasting.startAction")}
                    </Link>
                  </div>
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
