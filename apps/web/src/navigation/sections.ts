import type { ComponentType } from "react";

import { BarrelIcon, CrateIcon, GrapesIcon, PourIcon, WineryIcon } from "../brand/NavIcons";

export type SectionTab = Readonly<{ key: string; to: string }>;

export type Section = Readonly<{
  Icon: ComponentType;
  key: "discover" | "home" | "log" | "me" | "wines";
  /** Whether a page belongs to the section, for its icon to light up. */
  owns: (pathname: string) => boolean;
  tabs: readonly SectionTab[];
  to: string;
}>;

/**
 * The app's five destinations, each with its own pages as tabs: what to do
 * (record a tasting, identify a label, start an event), the reader's wines,
 * what there is to discover, and the reader's own numbers and settings. The
 * bar shows the five; a section's tabs head each of its pages.
 */
export const sections: readonly Section[] = [
  { Icon: WineryIcon, key: "home", owns: (path) => path === "/", tabs: [], to: "/" },
  {
    Icon: PourIcon,
    key: "log",
    owns: (path) =>
      path.startsWith("/log/") || path === "/sessions/new" || /^\/wines\/[^/]+\/taste/.test(path),
    tabs: [
      { key: "quick", to: "/log/new" },
      { key: "identify", to: "/log/identify" },
      { key: "event", to: "/sessions/new" },
    ],
    to: "/log/new",
  },
  {
    Icon: CrateIcon,
    key: "wines",
    owns: (path) =>
      /^\/(memory|cellar|wishlist|shop|regions\/tidy)(\/|$)/.test(path) ||
      (path.startsWith("/wines/") && !/^\/wines\/[^/]+\/taste/.test(path)),
    tabs: [
      { key: "memory", to: "/memory" },
      { key: "cellar", to: "/cellar" },
      { key: "wishlist", to: "/wishlist" },
      { key: "shop", to: "/shop" },
    ],
    to: "/memory",
  },
  {
    Icon: GrapesIcon,
    key: "discover",
    owns: (path) => /^\/(library|vicenc)(\/|$)/.test(path),
    tabs: [
      { key: "library", to: "/library" },
      { key: "assistant", to: "/vicenc" },
    ],
    to: "/library",
  },
  {
    Icon: BarrelIcon,
    key: "me",
    owns: (path) =>
      /^\/(stats|profile|about|spaces|settings)(\/|$)/.test(path) ||
      (path.startsWith("/sessions") && path !== "/sessions/new"),
    tabs: [
      { key: "stats", to: "/stats" },
      { key: "profile", to: "/profile" },
      { key: "sessions", to: "/sessions" },
      { key: "about", to: "/about" },
    ],
    to: "/stats",
  },
];

/** The section a page belongs to. */
export function sectionOf(pathname: string): Section {
  return sections.find((section) => section.owns(pathname)) ?? sections[0]!;
}

/**
 * The tab a page is, where it is one of its section's own pages — not a wine,
 * a note or a library card deeper in, which have their way back instead.
 */
export function tabOf(pathname: string): SectionTab | null {
  const section = sectionOf(pathname);
  return section.tabs.find((tab) => tab.to === pathname) ?? null;
}
