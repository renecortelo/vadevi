import type { WineSummary } from "@vadevi/contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { WineLink } from "../components/WineLink";
import { getWineMemory } from "../services/api";
import { useSession } from "../session/SessionContext";
import { type LibraryTrail, useLibraryTrail } from "./trail";

/**
 * The reader's own wines that a filter picks, in the Space they are in — from
 * a registered name, or tasted in a colour: how many, how often tasted, their
 * mean score, and each one's page. Without one, nothing shows, or what
 * `empty` says.
 */
export function YourWines({
  backHere,
  empty,
  filter,
  title,
}: {
  /** The way back from a wine to this page; the trail it came with otherwise. */
  backHere?: { libraryTrail: LibraryTrail };
  empty?: string;
  filter: { hue?: string; regionRef?: string };
  title: string;
}) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const incoming = useLibraryTrail();
  const trail = backHere ?? incoming;
  const spaceId = bootstrap.data.user.activeSpaceId;
  const [wines, setWines] = useState<WineSummary[]>([]);
  const { hue, regionRef } = filter;

  useEffect(() => {
    if (user === null || spaceId === null) return;
    const controller = new AbortController();
    getWineMemory(
      user,
      spaceId,
      {
        limit: 100,
        ...(hue === undefined ? {} : { hue }),
        ...(regionRef === undefined ? {} : { regionRef }),
        sort: "recent",
      },
      controller.signal,
    )
      .then((page) => setWines(page.data))
      .catch(() => setWines([]));
    return () => controller.abort();
  }, [hue, regionRef, spaceId, user]);

  if (spaceId === null) return null;
  if (wines.length === 0) {
    return empty === undefined ? null : <p className="section-help">{empty}</p>;
  }
  const tastings = wines.reduce((total, wine) => total + wine.noteCount, 0);
  const scored = wines.filter((wine) => wine.score100 !== null);
  const average =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((total, wine) => total + wine.score100!, 0) / scored.length);
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <section aria-labelledby="your-wines" className="settings-card your-wines">
      <h2 id="your-wines">{title}</h2>
      <p>
        {[
          t("library.yoursWines", { count: wines.length }),
          t("library.yoursTastings", { count: tastings }),
          average === null ? null : t("library.yoursAverage", { score: number.format(average) }),
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>
      <ul className="library-chips">
        {wines.map((wine) => (
          <li key={wine.id}>
            <WineLink state={trail} wine={{ spaceId, wineId: wine.id, wineName: wine.displayName }}>
              {wine.displayName}
              {wine.vintageYear === null ? "" : ` ${wine.vintageYear}`}
            </WineLink>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The reader's own wines from a registered name. Only the wines whose region
 * the library knows for certain to be this name count — a region typed
 * loosely is not guessed at.
 */
export function RegionTastings({
  backHere,
  regionId,
}: {
  backHere: { libraryTrail: LibraryTrail };
  regionId: string;
}) {
  const { t } = useTranslation();
  return (
    <YourWines
      backHere={backHere}
      filter={{ regionRef: regionId }}
      title={t("library.yoursTitle")}
    />
  );
}
