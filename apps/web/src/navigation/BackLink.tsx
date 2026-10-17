import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useNavigationType } from "react-router";

import { useLibraryTrail } from "../library/trail";
import { sectionOf, tabOf } from "./sections";

type Page = { label: string; path: string };

/** A page's own title, as its heading reads once its data is in. */
function headingOf(): string {
  const text = document.querySelector("#main-content h1")?.textContent?.trim() ?? "";
  return text.length > 48 ? `${text.slice(0, 47)}…` : text;
}

/**
 * «← Memory», «← Viña Tondonia»: on every page deeper than a section's own
 * tabs, a way back that names where the reader came from — back in history,
 * so the list keeps its place. Reached from outside (a shared link, a
 * reload), it leads to the section's first page instead. The library keeps
 * its own trail, which follows the reader from card to card.
 */
export function BackLink() {
  const { t } = useTranslation();
  const { pathname, search } = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const here = `${pathname}${search}`;
  const current = useRef<Page | null>(null);
  const [previous, setPrevious] = useState<Page | null>(null);
  const trail = useLibraryTrail();

  // On each page change, the page left behind becomes "previous"; going back
  // forgets it, as the history does.
  useEffect(() => {
    const left = current.current;
    current.current = { label: headingOf(), path: here };
    setPrevious(navigationType === "POP" || left === null || left.path === here ? null : left);
    // The heading may arrive with the page's data: follow it.
    const main = document.getElementById("main-content");
    if (main === null || globalThis.MutationObserver === undefined) return;
    const observer = new MutationObserver(() => {
      // Only while this is still the page: the next one's first render (its
      // loading heading) lands before this effect is cleaned up.
      if (`${globalThis.location.pathname}${globalThis.location.search}` !== here) return;
      current.current = { label: headingOf(), path: here };
    });
    observer.observe(main, { characterData: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [here, navigationType]);

  // A page reached along the library's trail shows that trail instead.
  if (
    pathname === "/" ||
    tabOf(pathname) !== null ||
    pathname.startsWith("/library") ||
    trail !== null
  ) {
    return null;
  }
  const section = sectionOf(pathname);
  const home = section.tabs[0];
  if (previous !== null && previous.label !== "") {
    return (
      <p className="back-link">
        <a
          className="text-link"
          href={previous.path}
          onClick={(event) => {
            event.preventDefault();
            void navigate(-1);
          }}
        >
          ← {previous.label}
        </a>
      </p>
    );
  }
  if (home === undefined) return null;
  return (
    <p className="back-link">
      <Link className="text-link" to={home.to}>
        ← {t(`sections.${home.key}`)}
      </Link>
    </p>
  );
}
