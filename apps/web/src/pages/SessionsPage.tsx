import type { TastingSessionResponse } from "@vadevi/contracts";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { offlineDatabase } from "../offline/database";
import { sessionsChangedEvent } from "../offline/events";
import { cacheSessionList } from "../offline/phase3";
import { listTastingSessions } from "../services/api";
import { useSession } from "../session/SessionContext";

type SessionSummary = TastingSessionResponse["data"];

export function SessionsPage() {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const userId = user?.uid ?? "";
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [usingCache, setUsingCache] = useState(false);

  const loadCached = useCallback(
    async (showCacheNotice = true) => {
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
      setUsingCache(showCacheNotice);
    },
    [spaceId, userId],
  );

  useEffect(() => {
    const controller = new AbortController();
    if (user === null || !navigator.onLine) {
      queueMicrotask(() => void loadCached());
    } else {
      void listTastingSessions(user, spaceId, controller.signal)
        .then(async (response) => {
          setSessions(response.data);
          setUsingCache(false);
          await cacheSessionList(user.uid, spaceId, response.data);
        })
        .catch(() => loadCached());
    }
    return () => controller.abort();
  }, [loadCached, spaceId, user]);

  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ spaceId: string }>).detail;
      if (detail.spaceId === spaceId) void loadCached(!navigator.onLine);
    };
    globalThis.addEventListener(sessionsChangedEvent, changed);
    return () => globalThis.removeEventListener(sessionsChangedEvent, changed);
  }, [loadCached, spaceId]);

  const dateFormatter = new Intl.DateTimeFormat(i18n.language, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <section className="sessions-page">
      <header className="page-heading sessions-heading">
        <div>
          <p className="eyebrow">{t("sessions.eyebrow")}</p>
          <h1>{t("sessions.title")}</h1>
          <p>{t("sessions.body")}</p>
        </div>
        <Link className="action-link action-link--primary" to="/sessions/new">
          {t("sessions.newAction")}
        </Link>
      </header>
      {usingCache ? (
        <p className="cache-note" role="status">
          {t("sessions.cached")}
        </p>
      ) : null}
      {sessions.length === 0 ? (
        <div className="empty-state">
          <h2>{t("sessions.emptyTitle")}</h2>
          <p>{t("sessions.emptyBody")}</p>
          <Link className="action-link action-link--primary" to="/sessions/new">
            {t("sessions.newAction")}
          </Link>
        </div>
      ) : (
        <div className="session-card-grid">
          {sessions.map((session) => (
            <article className="session-card" key={session.id}>
              <div className="session-card__meta">
                <span className="status-chip" data-status={session.status}>
                  {t(`sessions.status.${session.status}`)}
                </span>
                <time dateTime={session.startsAt}>
                  {dateFormatter.format(new Date(session.startsAt))}
                </time>
              </div>
              <h2>{session.name}</h2>
              {session.venueText === null ? null : <p>{session.venueText}</p>}
              <p className="session-card__counts">
                {t("sessions.wineCount", { count: session.wineCount })} ·{" "}
                {t("sessions.submissionCount", { count: session.submittedNoteCount })}
              </p>
              <Link className="text-link" to={`/sessions/${session.id}`}>
                {t("sessions.openAction")}
              </Link>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
