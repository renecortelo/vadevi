import type { WineSummary } from "@vadevi/contracts";

import type { PickableWine } from "../components/wine-label";
import { getWine, type TokenSource } from "../services/api";
import { offlineDatabase, partitionId } from "./database";

/**
 * The whole wines behind a picker's choice.
 *
 * The event screens offer wines by label only (`wines/lookup`), but what they
 * queue is a session as it will look once saved, wines and all, so it can be
 * shown at once and offline. The whole wine is nearly always already on the
 * device — the offline copy keeps the Space's wines — so it is read from
 * there; only a wine the copy does not hold yet (one added a moment ago) is
 * asked for, one by one. Offline, the picker itself offers only wines from the
 * copy, so nothing is missing.
 *
 * In the order chosen. Throws when a wine can be neither found nor fetched, so
 * the screen reports it instead of queueing a flight with a hole in it.
 */
export async function wholeWines(
  tokenSource: TokenSource | null,
  userId: string,
  spaceId: string,
  wines: readonly PickableWine[],
): Promise<WineSummary[]> {
  if (wines.length === 0) return [];
  const prefix = partitionId(userId, spaceId);
  const stored = await offlineDatabase.snapshots.bulkGet(
    wines.map((wine) => `${prefix}:${wine.id}`),
  );
  return Promise.all(
    wines.map(async (wine, index) => {
      const kept = stored[index]?.wine;
      if (kept !== undefined) return kept;
      if (tokenSource === null) throw new Error("The wine is not on this device.");
      return getWine(tokenSource, spaceId, wine.id);
    }),
  );
}
