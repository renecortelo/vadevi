import type { TastingHistoryEntry } from "@vadevi/contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useAuth } from "../auth/AuthContext";
import { getWineTastings } from "../services/tasting";
import { MapLink } from "./MapLink";

/**
 * A wine's tastings, with the way in to record another.
 *
 * A wine holds many tastings — the same bottle, or a re-visit years apart — so
 * this is the one place they gather: how many there are, each one openable to
 * read (and from there, to correct), and the button to add another. The button
 * says "record another" once any exist, because a bare "taste this" reads as if
 * the wine had never been opened.
 *
 * Two shapes. On the evidence page it stands open as a section; on a memory card
 * it starts collapsed behind its count, because a hundred cards cannot each
 * carry a list. Both fetch lazily — the card only when expanded — so the list is
 * never loaded for wines nobody looks at.
 */
export function TastingHistory({
  compact = false,
  count = 0,
  spaceId,
  wineId,
}: {
  /** Card mode: collapsed behind the count, expanded on demand. */
  compact?: boolean;
  /** Known up front (the summary carries it), so the toggle reads true before
   *  the list is fetched, and a wine never tasted shows only the way to start. */
  count?: number;
  spaceId: string;
  wineId: string;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const [tastings, setTastings] = useState<TastingHistoryEntry[] | null>(null);
  const [open, setOpen] = useState(!compact);

  useEffect(() => {
    if (user === null || !open || tastings !== null) return;
    const controller = new AbortController();
    void getWineTastings(user, spaceId, wineId, controller.signal)
      .then(setTastings)
      .catch(() => setTastings([]));
    return () => controller.abort();
  }, [open, spaceId, tastings, user, wineId]);

  // The fetched list once it arrives, else the seeded count for the label.
  const shown = tastings ?? [];
  const known = tastings === null ? count : shown.length;

  // A wine never tasted needs no list and no toggle — only the way to begin.
  if (compact && known === 0) {
    return (
      <Link className="action-link action-link--secondary" to={`/wines/${wineId}/taste`}>
        {t("evidence.firstTasting")}
      </Link>
    );
  }

  const list =
    shown.length === 0 ? null : (
      <ul className="tasting-history__list">
        {shown.map((entry) => (
          <li key={entry.id}>
            <div>
              <strong>{new Date(entry.tastedAt).toLocaleDateString(i18n.language)}</strong>
              <span>
                {entry.isSelf ? t("evidence.historyYou") : entry.authorName}
                {entry.score100 === null ? "" : ` · ${entry.score100}/100`}
              </span>
              {entry.venueName === null ? null : (
                <span>
                  {entry.venueName}{" "}
                  <MapLink
                    className="text-link"
                    latitude={entry.venueLatitude}
                    longitude={entry.venueLongitude}
                    name={entry.venueName}
                  />
                </span>
              )}
            </div>
            {/* Only your own tasting opens to read and correct; the server
                refuses anybody else's, so the link would be a dead end. */}
            {entry.isSelf ? (
              <Link className="text-link" to={`/wines/${wineId}/tastings/${entry.id}`}>
                {t("evidence.historyRead")}
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    );

  return (
    <section className="tasting-history">
      {compact ? (
        <button
          aria-expanded={open}
          className="tasting-history__toggle text-button"
          onClick={() => setOpen((current) => !current)}
          type="button"
        >
          {t("evidence.historyToggle", { count: known })}
        </button>
      ) : (
        <h2 id="tasting-history">{t("evidence.historyTitle")}</h2>
      )}
      {open ? (
        <>
          {tastings === null ? (
            <p className="section-help">{t("evidence.historyLoading")}</p>
          ) : (
            list
          )}
          <Link className="action-link action-link--secondary" to={`/wines/${wineId}/taste`}>
            {known === 0 ? t("evidence.firstTasting") : t("evidence.anotherTasting")}
          </Link>
        </>
      ) : null}
    </section>
  );
}
