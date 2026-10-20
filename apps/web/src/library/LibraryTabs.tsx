import { useTranslation } from "react-i18next";

import { type LibraryShelf, libraryShelves } from "./shelves";

/**
 * The library's shelves as one row of tabs — grapes, names, styles, the
 * wheels and the atlas in figures. Each is switched in place on the library's
 * own page, which stays as it is: only what is beneath the tabs changes.
 */
export function LibraryTabs({
  current,
  onSelect,
}: {
  current: LibraryShelf;
  onSelect: (shelf: LibraryShelf) => void;
}) {
  const { t } = useTranslation();
  const label = (shelf: LibraryShelf) =>
    shelf === "wheels"
      ? t("library.wheels.tab")
      : shelf === "atlas"
        ? t("library.coverage.title")
        : t(`library.home.tab.${shelf}`);
  return (
    <nav aria-label={t("library.home.title")} className="segmented-control library-tabs">
      {libraryShelves.map((shelf) => (
        <button
          aria-pressed={current === shelf}
          key={shelf}
          onClick={() => onSelect(shelf)}
          type="button"
        >
          {label(shelf)}
        </button>
      ))}
    </nav>
  );
}
