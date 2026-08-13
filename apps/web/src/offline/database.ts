import type {
  BootstrapResponse,
  CreateWineRequest,
  QuickTastingRequest,
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
  id: string;
  lastError?: string;
  localMedia?: LocalMedia;
  occurredAt: string;
  operation: "create";
  payload: Record<string, unknown>;
  resourceId: string;
  resourceType: "tasting_note" | "wine_record";
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
  resourceType: "tasting_note" | "wine_record";
  serverPayload?: unknown;
  spaceId: string;
  userId: string;
};

class OfflineDatabase extends Dexie {
  conflicts!: EntityTable<SyncConflict, "id">;
  drafts!: EntityTable<QuickLogDraft, "id">;
  mutations!: EntityTable<QueuedMutation, "id">;
  sessions!: EntityTable<SessionSnapshot, "id">;
  snapshots!: EntityTable<MemorySnapshot, "id">;
  syncMetadata!: EntityTable<SyncMetadata, "id">;

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
      offlineDatabase.drafts,
      offlineDatabase.mutations,
      offlineDatabase.sessions,
      offlineDatabase.snapshots,
      offlineDatabase.syncMetadata,
    ],
    async () => {
      await Promise.all([
        offlineDatabase.conflicts.where("userId").equals(userId).delete(),
        offlineDatabase.drafts.where("userId").equals(userId).delete(),
        offlineDatabase.mutations.where("userId").equals(userId).delete(),
        offlineDatabase.sessions.where("userId").equals(userId).delete(),
        offlineDatabase.snapshots.where("userId").equals(userId).delete(),
        offlineDatabase.syncMetadata.where("userId").equals(userId).delete(),
      ]);
    },
  );
}

export async function clearAllOfflineData(): Promise<void> {
  await offlineDatabase.delete();
  await offlineDatabase.open();
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
      offlineDatabase.drafts,
      offlineDatabase.mutations,
      offlineDatabase.snapshots,
      offlineDatabase.syncMetadata,
    ],
    async () => {
      for (const table of [
        offlineDatabase.conflicts,
        offlineDatabase.drafts,
        offlineDatabase.mutations,
        offlineDatabase.snapshots,
        offlineDatabase.syncMetadata,
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
