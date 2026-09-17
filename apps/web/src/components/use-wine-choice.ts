import { useState } from "react";

import type { PickableWine } from "./wine-label";

/**
 * Wines ticked from a browsable list.
 *
 * The chosen wines are kept as whole records, not as ids resolved against
 * whatever the list happens to hold. Both event screens used to build their
 * submission with `visibleWines.filter(wine => ids.includes(wine.id))`, which is
 * correct only while the visible list never changes — and it is about to, because
 * typing to search replaces it. A wine ticked before a search and gone from the
 * results afterwards would have been dropped from the flight silently.
 *
 * `chosen` therefore survives the list moving underneath it, and callers render
 * ticked-but-filtered-out wines alongside the results so they can still be
 * unticked.
 */
export function useWineChoice<Wine extends PickableWine>(): {
  chosen: Wine[];
  clear: () => void;
  ids: string[];
  isChosen: (wineId: string) => boolean;
  toggle: (wine: Wine, checked: boolean) => void;
} {
  const [byId, setById] = useState<Record<string, Wine>>({});
  const [ids, setIds] = useState<string[]>([]);

  return {
    // In the order they were ticked, which is the order they were meant in.
    chosen: ids.flatMap((id) => (byId[id] === undefined ? [] : [byId[id]])),
    clear: () => {
      setIds([]);
      setById({});
    },
    ids,
    isChosen: (wineId) => ids.includes(wineId),
    toggle: (wine, checked) => {
      setById((current) => ({ ...current, [wine.id]: wine }));
      setIds((current) =>
        checked ? [...current, wine.id] : current.filter((id) => id !== wine.id),
      );
    },
  };
}
