import { createContext, useContext } from "react";

import type { QuickLogDraft } from "./database";

export type SyncStatus = "idle" | "offline" | "saved" | "syncing" | "synced" | "needs_attention";

export type OfflineSyncContextValue = {
  clearOfflineData: () => Promise<void>;
  flush: (spaceId?: string) => Promise<void>;
  pendingCount: number;
  queueDraft: (draft: QuickLogDraft) => Promise<void>;
  refreshStatus: () => Promise<void>;
  status: SyncStatus;
};

export const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

export function useOfflineSync(): OfflineSyncContextValue {
  const context = useContext(OfflineSyncContext);
  if (context === null) throw new Error("useOfflineSync must be used inside OfflineSyncProvider.");
  return context;
}
