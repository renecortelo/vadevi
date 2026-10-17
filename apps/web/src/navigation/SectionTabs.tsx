import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

import { useViewTransition } from "../motion/useViewTransition";
import { sectionOf, tabOf } from "./sections";

/**
 * A section's pages as tabs at the head of each of them — Memory, Cellar,
 * Wishlist, Prices under «My wines» — so the pages of one place are a touch
 * apart. Shown only on those pages themselves.
 */
export function SectionTabs() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const transition = useViewTransition();
  const current = tabOf(pathname);
  if (current === null) return null;
  const section = sectionOf(pathname);
  return (
    <nav aria-label={t(`nav.${section.key}`)} className="segmented-control section-tabs">
      {section.tabs.map((tab) => (
        <Link
          aria-current={tab === current ? "page" : undefined}
          key={tab.key}
          onClick={tab === current ? undefined : transition(tab.to)}
          to={tab.to}
        >
          {t(`sections.${tab.key}`)}
        </Link>
      ))}
    </nav>
  );
}
