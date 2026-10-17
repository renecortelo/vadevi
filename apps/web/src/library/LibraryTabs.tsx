import { useTranslation } from "react-i18next";
import { Link } from "react-router";

import { useViewTransition } from "../motion/useViewTransition";

export type LibraryShelf = "atlas" | "grapes" | "regions" | "topics";
const shelves = ["grapes", "regions", "topics"] as const;

/**
 * The library's shelves as one row of tabs — grapes, names, styles and the
 * atlas in figures — the same on every page that has them. On the library's
 * own page a shelf is switched in place (`onSelect`); elsewhere each tab is a
 * link to it.
 */
export function LibraryTabs({
  current,
  onSelect,
}: {
  current: LibraryShelf;
  onSelect?: (shelf: Exclude<LibraryShelf, "atlas">) => void;
}) {
  const { t } = useTranslation();
  const transition = useViewTransition();
  return (
    <nav aria-label={t("library.home.title")} className="segmented-control library-tabs">
      {shelves.map((shelf) =>
        onSelect === undefined ? (
          <Link
            key={shelf}
            onClick={transition(`/library?tab=${shelf}`)}
            to={`/library?tab=${shelf}`}
          >
            {t(`library.home.tab.${shelf}`)}
          </Link>
        ) : (
          <button
            aria-pressed={current === shelf}
            key={shelf}
            onClick={() => onSelect(shelf)}
            type="button"
          >
            {t(`library.home.tab.${shelf}`)}
          </button>
        ),
      )}
      <Link
        aria-current={current === "atlas" ? "page" : undefined}
        onClick={current === "atlas" ? undefined : transition("/library/atlas")}
        to="/library/atlas"
      >
        {t("library.coverage.title")}
      </Link>
    </nav>
  );
}
