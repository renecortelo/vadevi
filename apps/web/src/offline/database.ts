import type {
  BootstrapResponse,
  BottleListResponse,
  CreateWineRequest,
  DeepTastingNote,
  DeepTastingRequest,
  QuickTastingRequest,
  PriceObservationListResponse,
  SessionComparisonResponse,
  TastingSessionDetailResponse,
  WishlistListResponse,
  WineSummary,
} from "@vadevi/contracts";
import Dexie, { type EntityTable } from "dexie";

export type LocalMedia = {
  blob: Blob;
  byteSize: number;
  height: number;
  idempotencyKey: string;
  mimeType: "image/jpeg";
  sha256: string;
  width: number;
};

export type QuickLogDraft = {
  id: string;
  includeNote: boolean;
  noteId: string;
  noteMutationId: string;
  notePayload: Omit<QuickTastingRequest, "clientId" | "wineId">;
  photo?: LocalMedia;
  spaceId: string;
  updatedAt: string;
  userId: string;
  wineId: string;
  wineMutationId: string;
  winePayload: Omit<CreateWineRequest, "clientId" | "mediaId">;
};

export type QueuedMutation = {
  baseVersion?: number;
  id: string;
  lastError?: string;
  localMedia?: LocalMedia;
  occurredAt: string;
  operation: "create" | "reorder" | "save";
  payload: Record<string, unknown>;
  resourceId: string;
  resourceType:
    | "deep_tasting_note"
    | "session_order"
    | "session_wines"
    | "tasting_note"
    | "tasting_session"
    | "wine_record";
  spaceId: string;
  state: "needs_attention" | "queued" | "syncing";
  userId: string;
};

export type MemorySnapshot = {
  id: string;
  spaceId: string;
  updatedAt: string;
  userId: string;
  wine: WineSummary;
};

export type SessionSnapshot = {
  bootstrap: BootstrapResponse;
  id: string;
  updatedAt: string;
  userId: string;
};

export type DeepTastingDraft = {
  id: string;
  note: DeepTastingNote | null;
  noteId: string;
  payload: DeepTastingRequest;
  sessionId: string | null;
  spaceId: string;
  updatedAt: string;
  userId: string;
};

export type TastingSessionSnapshot = {
  comparison: SessionComparisonResponse | null;
  detail: TastingSessionDetailResponse;
  id: string;
  sessionId: string;
  spaceId: string;
  updatedAt: string;
  userId: string;
};

export type SyncMetadata = {
  id: string;
  cursor: string | null;
  deviceId: string;
  spaceId: string;
  userId: string;
};

export type SyncConflict = {
  id: string;
  localPayload: Record<string, unknown>;
  resourceId: string;
  resourceType: QueuedMutation["resourceType"];
  serverPayload?: unknown;
  spaceId: string;
  userId: string;
};

export type CellarSnapshot = {
  id: string;
  response: BottleListResponse;
  spaceId: string;
  updatedAt: string;
  userId: string;
};

export type WishlistSnapshot = {
  id: string;
  response: WishlistListResponse;
  spaceId: string;
  updatedAt: string;
  userId: string;
};

export type PriceSnapshot = {
  id: string;
  response: PriceObservationListResponse;
  spaceId: string;
  updatedAt: string;
  userId: string;
  wineId: string;
};

class OfflineDatabase extends Dexie {
  cellar!: EntityTable<CellarSnapshot, "id">;
  conflicts!: EntityTable<SyncConflict, "id">;
  deepDrafts!: EntityTable<DeepTastingDraft, "id">;
  drafts!: EntityTable<QuickLogDraft, "id">;
  mutations!: EntityTable<QueuedMutation, "id">;
  prices!: EntityTable<PriceSnapshot, "id">;
  sessions!: EntityTable<SessionSnapshot, "id">;
  snapshots!: EntityTable<MemorySnapshot, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "id">;
  tastingSessions!: EntityTable<TastingSessionSnapshot, "id">;
  wishlist!: EntityTable<WishlistSnapshot, "id">;

  constructor() {
    super("vadevi-offline-v1");
    this.version(1).stores({
      conflicts: "id, userId, [userId+spaceId]",
      drafts: "id, userId, [userId+spaceId], updatedAt",
      mutations: "id, userId, [userId+spaceId], [userId+spaceId+state], occurredAt",
      snapshots: "id, userId, [userId+spaceId], updatedAt",
      syncMetadata: "id, userId, [userId+spaceId]",
    });
    this.version(2).stores({
      conflicts: "id, userId, [userId+spaceId]",
      drafts: "id, userId, [userId+spaceId], updatedAt",
      mutations: "id, userId, [userId+spaceId], [userId+spaceId+state], occurredAt",
      sessions: "id, userId, updatedAt",
      snapshots: "id, userId, [userId+spaceId], updatedAt",
      syncMetadata: "id, userId, [userId+spaceId]",
    });
    this.version(3).stores({
      conflicts: "id, userId, [userId+spaceId]",
      deepDrafts: "id, userId, [userId+spaceId], noteId, updatedAt",
      drafts: "id, userId, [userId+spaceId], updatedAt",
      mutations: "id, userId, [userId+spaceId], [userId+spaceId+state], occurredAt",
      sessions: "id, userId, updatedAt",
      snapshots: "id, userId, [userId+spaceId], updatedAt",
      syncMetadata: "id, userId, [userId+spaceId]",
      tastingSessions: "id, userId, [userId+spaceId], sessionId, updatedAt",
    });
    this.version(4).stores({
      cellar: "id, userId, [userId+spaceId], updatedAt",
      conflicts: "id, userId, [userId+spaceId]",
      deepDrafts: "id, userId, [userId+spaceId], noteId, updatedAt",
      drafts: "id, userId, [userId+spaceId], updatedAt",
      mutations: "id, userId, [userId+spaceId], [userId+spaceId+state], occurredAt",
      prices: "id, userId, [userId+spaceId], wineId, updatedAt",
      sessions: "id, userId, updatedAt",
      snapshots: "id, userId, [userId+spaceId], updatedAt",
      syncMetadata: "id, userId, [userId+spaceId]",
      tastingSessions: "id, userId, [userId+spaceId], sessionId, updatedAt",
      wishlist: "id, userId, [userId+spaceId], updatedAt",
    });
  }
}

export const offlineDatabase = new OfflineDatabase();

export function partitionId(userId: string, spaceId: string): string {
  return `${userId}:${spaceId}`;
}

export async function clearOfflineDataForUser(userId: string): Promise<void> {
  await offlineDatabase.transaction(
    "rw",
    [
      offlineDatabase.conflicts,
      offlineDatabase.cellar,
      offlineDatabase.deepDrafts,
      offlineDatabase.drafts,
      offlineDatabase.mutations,
      offlineDatabase.prices,
      offlineDatabase.sessions,
      offlineDatabase.snapshots,
      offlineDatabase.syncMetadata,
      offlineDatabase.tastingSessions,
      offlineDatabase.wishlist,
    ],
    async () => {
      await Promise.all([
        offlineDatabase.conflicts.where("userId").equals(userId).delete(),
        offlineDatabase.cellar.where("userId").equals(userId).delete(),
        offlineDatabase.deepDrafts.where("userId").equals(userId).delete(),
        offlineDatabase.drafts.where("userId").equals(userId).delete(),
        offlineDatabase.mutations.where("userId").equals(userId).delete(),
        offlineDatabase.prices.where("userId").equals(userId).delete(),
        offlineDatabase.sessions.where("userId").equals(userId).delete(),
        offlineDatabase.snapshots.where("userId").equals(userId).delete(),
        offlineDatabase.syncMetadata.where("userId").equals(userId).delete(),
        offlineDatabase.tastingSessions.where("userId").equals(userId).delete(),
        offlineDatabase.wishlist.where("userId").equals(userId).delete(),
      ]);
    },
  );
  globalThis.localStorage?.removeItem("vadevi.activeSpaceId");
}

export async function clearAllOfflineData(): Promise<void> {
  await offlineDatabase.delete();
  await offlineDatabase.open();
  globalThis.localStorage?.removeItem("vadevi.activeSpaceId");
}

export async function purgeUnavailableSpaces(
  userId: string,
  allowedSpaceIds: string[],
): Promise<void> {
  const allowed = new Set(allowedSpaceIds);
  await offlineDatabase.transaction(
    "rw",
    [
      offlineDatabase.conflicts,
      offlineDatabase.cellar,
      offlineDatabase.deepDrafts,
      offlineDatabase.drafts,
      offlineDatabase.mutations,
      offlineDatabase.prices,
      offlineDatabase.snapshots,
      offlineDatabase.syncMetadata,
      offlineDatabase.tastingSessions,
      offlineDatabase.wishlist,
    ],
    async () => {
      for (const table of [
        offlineDatabase.conflicts,
        offlineDatabase.cellar,
        offlineDatabase.deepDrafts,
        offlineDatabase.drafts,
        offlineDatabase.mutations,
        offlineDatabase.prices,
        offlineDatabase.snapshots,
        offlineDatabase.syncMetadata,
        offlineDatabase.tastingSessions,
        offlineDatabase.wishlist,
      ]) {
        const records = await table.where("userId").equals(userId).toArray();
        const ids = records
          .filter((record) => !allowed.has(record.spaceId))
          .map((record) => record.id);
        await table.bulkDelete(ids);
      }
    },
  );
}
