import { useEffect, useRef, useState } from "react";

import { type PickableWine, wineOptionLabel } from "./wine-label";

/**
 * Typing to find a wine, in the several places that need it.
 *
 * Two rules live here rather than in each caller, because getting either wrong
 * is invisible until something hangs:
 *
 * The search callback is held in a ref and is NOT a dependency of the effect.
 * Screens pass a plain function, which is a new identity on every render; with
 * it as a dependency the sequence was effect → fetch → set the wine list →
 * re-render → new function → effect, an unbounded request loop that hung the
 * browser tests instead of failing them.
 *
 * And the first search is skipped while the box is empty. The screen has
 * already loaded its own list; an empty search on mount would only ask for it a
 * second time.
 */
export function useWineSearch(
  wines: PickableWine[],
  onSearch?: ((query: string) => Promise<void> | void) | undefined,
): { filter: string; setFilter: (value: string) => void; shown: PickableWine[] } {
  const [filter, setFilter] = useState("");

  const searchRef = useRef(onSearch);
  // Assigned in an effect, not during render: React forbids touching a ref while
  // rendering, and this only needs to be current by the time a search fires.
  useEffect(() => {
    searchRef.current = onSearch;
  }, [onSearch]);

  const searched = useRef(false);
  useEffect(() => {
    if (!searched.current) {
      searched.current = true;
      if (filter.trim().length === 0) return;
    }
    const search = searchRef.current;
    if (search === undefined) return;
    // Debounced, so a search runs once the reader pauses, not per keystroke.
    const timer = globalThis.setTimeout(() => void search(filter.trim()), 250);
    return () => globalThis.clearTimeout(timer);
  }, [filter]);

  const needle = filter.trim().toLowerCase();
  // Narrowed here as well as on the server, so what is already loaded reacts to
  // the first keystroke rather than after a round trip.
  const shown =
    needle.length === 0
      ? wines
      : wines.filter((wine) => wineOptionLabel(wine).toLowerCase().includes(needle));

  return { filter, setFilter, shown };
}
