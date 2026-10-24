import { type CSSProperties, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router";

import { useViewTransition } from "../motion/useViewTransition";
import { sectionOf, tabOf } from "./sections";

/** One canvas for every measure: its text metrics need no layout. */
let measuring: CanvasRenderingContext2D | null = null;

/**
 * Whether the tabs fit on one row. Each label is measured by its own text in
 * its own font, not by the box it is in, so the answer does not change with
 * the layout it chooses — measuring the boxes made a narrow pair of rows read
 * as fitting, and the tabs flipped between the two.
 */
function fitsOneRow(nav: HTMLElement): boolean {
  measuring ??= document.createElement("canvas").getContext("2d");
  const links = [...nav.querySelectorAll<HTMLElement>(":scope > a")];
  if (measuring === null || links.length === 0) return true;
  const navStyle = getComputedStyle(nav);
  const room =
    nav.clientWidth -
    parseFloat(navStyle.paddingInlineStart) -
    parseFloat(navStyle.paddingInlineEnd);
  const gap = parseFloat(navStyle.columnGap) || 0;
  let needed = gap * (links.length - 1);
  for (const link of links) {
    const style = getComputedStyle(link);
    measuring.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    needed +=
      measuring.measureText(link.textContent ?? "").width +
      parseFloat(style.paddingInlineStart) +
      parseFloat(style.paddingInlineEnd);
  }
  return needed <= room;
}

/**
 * A section's pages as tabs at the head of each of them — Memory, Cellar,
 * Wishlist, Prices under «My wines» — so the pages of one place are a touch
 * apart. Shown only on those pages themselves.
 *
 * On one row when they fit; when they do not, in even rows — four as two and
 * two, five as three and two — rather than as many as fit and one left alone.
 */
export function SectionTabs() {
  const { i18n, t } = useTranslation();
  const { pathname } = useLocation();
  const transition = useViewTransition();
  const navRef = useRef<HTMLElement>(null);
  const [oneRow, setOneRow] = useState(true);
  const current = tabOf(pathname);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (nav === null) return;
    const measure = () => setOneRow(fitsOneRow(nav));
    measure();
    // Where there is no observer (a test's document), one measure will do.
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    // The labels' own font may arrive after the first measure.
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [pathname, i18n.language]);

  if (current === null) return null;
  const section = sectionOf(pathname);
  return (
    <nav
      aria-label={t(`nav.${section.key}`)}
      className="segmented-control section-tabs"
      data-rows={oneRow ? undefined : "even"}
      ref={navRef}
      style={
        oneRow
          ? undefined
          : ({ "--tab-columns": Math.ceil(section.tabs.length / 2) } as CSSProperties)
      }
    >
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
