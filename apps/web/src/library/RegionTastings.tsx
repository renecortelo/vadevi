import type { WineSummary } from "@vadevi/contracts";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../auth/AuthContext";
import { WineLink } from "../components/WineLink";
import { getWineMemory } from "../services/api";
import { useSession } from "../session/SessionContext";
import { useLibraryTrail } from "./trail";

/**
 * The reader's own wines from a registered name, in the Space they are in:
 * how many, how often tasted, their mean score, and each one's page. Only the
 * wines whose region the library knows for certain to be this name count —
 * a region typed loosely is not guessed at. Nothing shows without one.
 */
export function RegionTastings({ regionId }: { regionId: string }) {
  const { i18n, t } = useTranslation();
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const trail = useLibraryTrail();
  const spaceId = bootstrap.data.user.activeSpaceId;
  const [wines, setWines] = useState<WineSummary[]>([]);

  useEffect(() => {
    if (user === null || spaceId === null) return;
    const controller = new AbortController();
    getWineMemory(
      user,
      spaceId,
      { limit: 100, regionRef: regionId, sort: "recent" },
      controller.signal,
    )
      .then((page) => setWines(page.data))
      .catch(() => setWines([]));
    return () => controller.abort();
  }, [regionId, spaceId, user]);

  if (wines.length === 0 || spaceId === null) return null;
  const tastings = wines.reduce((total, wine) => total + wine.noteCount, 0);
  const scored = wines.filter((wine) => wine.score100 !== null);
  const average =
    scored.length === 0
      ? null
      : Math.round(scored.reduce((total, wine) => total + wine.score100!, 0) / scored.length);
  const number = new Intl.NumberFormat(i18n.language);

  return (
    <section aria-labelledby="region-yours" className="settings-card">
      <h2 id="region-yours">{t("library.yoursTitle")}</h2>
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
