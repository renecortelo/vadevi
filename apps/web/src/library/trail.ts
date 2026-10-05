import { useLocation } from "react-router";

/**
 * Where the reader came into the library from, so they can go back to it.
 *
 * A wine's evidence links to its grapes and its region; once inside the
 * library the only way out was "← Wine library", and the wine was lost. The
 * page that links in leaves its name and address in the navigation state, and
 * every library page shows a way back to it — carried along from card to card,
 * so a grape, then its region, then another grape still lead back to the wine.
 */
export type LibraryTrail = Readonly<{ label: string; path: string }>;

type TrailState = Readonly<{ libraryTrail?: LibraryTrail }> | null;

/** Navigation state that leaves a trail back to this page. */
export function trailFrom(label: string, path: string): { libraryTrail: LibraryTrail } {
  return { libraryTrail: { label, path } };
}

/** The trail this page was reached with, to hand on to the next library page. */
export function useLibraryTrail(): { libraryTrail: LibraryTrail } | null {
  // The router's own state object, so it keeps its identity between renders
  // and can sit in an effect's dependencies.
  const state = useLocation().state as TrailState;
  return state?.libraryTrail === undefined ? null : (state as { libraryTrail: LibraryTrail });
}
