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
export type LibraryTrail = Readonly<{
  /** The way back from there, in turn: the trail is a chain. */
  back?: LibraryTrail;
  label: string;
  path: string;
}>;

/** How far back a chain reaches: enough for a wander, not a history. */
const deepest = 8;

function shorten(trail: LibraryTrail, steps: number): LibraryTrail {
  if (trail.back === undefined) return trail;
  if (steps <= 1) return { label: trail.label, path: trail.path };
  return { ...trail, back: shorten(trail.back, steps - 1) };
}

type TrailState = Readonly<{ libraryTrail?: LibraryTrail }> | null;

/**
 * Navigation state that leaves a trail back to this page — and, from it, on
 * to wherever this page was reached from (`from`), so a wine, its grape, the
 * wheel and back again each lead to the one before. Coming round to a page
 * already on the trail picks it up from there rather than going in circles.
 */
export function trailFrom(
  label: string,
  path: string,
  from?: { libraryTrail: LibraryTrail } | null,
): { libraryTrail: LibraryTrail } {
  let back = from?.libraryTrail;
  for (let step = back; step !== undefined; step = step.back) {
    if (step.path === path) {
      back = step.back;
      break;
    }
  }
  return {
    libraryTrail:
      back === undefined ? { label, path } : { back: shorten(back, deepest), label, path },
  };
}

/** The trail this page was reached with, to hand on to the next library page. */
export function useLibraryTrail(): { libraryTrail: LibraryTrail } | null {
  // The router's own state object, so it keeps its identity between renders
  // and can sit in an effect's dependencies.
  const state = useLocation().state as TrailState;
  return state?.libraryTrail === undefined ? null : (state as { libraryTrail: LibraryTrail });
}
