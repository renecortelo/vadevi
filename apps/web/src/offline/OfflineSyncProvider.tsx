import {
  AddSessionWinesRequestSchema,
  CreateTastingSessionRequestSchema,
  DeepTastingRequestSchema,
  ReorderSessionWinesRequestSchema,
  UpdateDeepTastingRequestSchema,
  type BootstrapResponse,
  type DeepTastingRequest,
  type SyncMutation,
  type UpdateDeepTastingRequest,
  type WineSummary,
} from "@vadevi/contracts";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../auth/AuthContext";
import { idempotencyKeyForMutation } from "../security/idempotency";
import { createUlid } from "../security/ulid";
import {
  ApiError,
  getWineMemory,
  identifyWine,
  reserveMedia,
  syncSpace,
  uploadMedia,
} from "../services/api";
import { useSession } from "../session/SessionContext";
import {
  clearOfflineDataForUser,
  offlineDatabase,
  partitionId,
  purgeUnavailableSpaces,
  type QueuedMutation,
  type QuickLogDraft,
} from "./database";
import { OfflineSyncContext, type SyncStatus } from "./OfflineSyncContext";
import { memoryChangedEvent, sessionsChangedEvent } from "./events";
import { cacheSessionDetail, cacheSessionList, storeSyncedDeepNote } from "./phase3";

function asSyncMutation(mutation: QueuedMutation): SyncMutation {
  return {
    baseVersion: null,
    mutationId: mutation.id,
    occurredAt: mutation.occurredAt,
    operation: "create",
    payload: mutation.payload,
    resourceId: mutation.resourceId,
    resourceType: mutation.resourceType,
  } as SyncMutation;
}

function isPhaseTwoMutation(mutation: QueuedMutation): boolean {
  return (
    mutation.operation === "create" &&
    (mutation.resourceType === "wine_record" || mutation.resourceType === "tasting_note")
  );
}

function deepUpdateRequest(request: DeepTastingRequest, version: number): UpdateDeepTastingRequest {
  const immutable = new Set(["clientId", "mode", "sessionWineId", "state", "wineId"]);
  const fields = Object.fromEntries(Object.entries(request).filter(([key]) => !immutable.has(key)));
  return UpdateDeepTastingRequestSchema.parse({ ...fields, version });
}

export function OfflineSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { bootstrap } = useSession();
  const [status, setStatus] = useState<SyncStatus>(navigator.onLine ? "idle" : "offline");
  const [pendingCount, setPendingCount] = useState(0);
  const flushing = useRef(new Set<string>());
  const userId = user?.uid ?? "";
  const activeSpaceId = bootstrap.data.user.activeSpaceId;
  const allowedSpaceIds = useMemo(
    () =>
      bootstrap.data.spaces.map((space: BootstrapResponse["data"]["spaces"][number]) => space.id),
    [bootstrap.data.spaces],
  );

  const refreshStatus = useCallback(async () => {
    if (userId.length === 0) return;
    const mutations = await offlineDatabase.mutations.where("userId").equals(userId).toArray();
    setPendingCount(mutations.length);
    if (!navigator.onLine) setStatus("offline");
    else if (mutations.some((mutation) => mutation.state === "needs_attention")) {
      setStatus("needs_attention");
    } else if (mutations.length > 0) setStatus("saved");
    else setStatus("synced");
  }, [userId]);

  const refreshMemory = useCallback(
    async (spaceId: string) => {
      if (user === null) return;
      const response = await getWineMemory(user, spaceId, { limit: 100 });
      const prefix = partitionId(user.uid, spaceId);
      await offlineDatabase.transaction("rw", offlineDatabase.snapshots, async () => {
        const existing = await offlineDatabase.snapshots
          .where("[userId+spaceId]")
          .equals([user.uid, spaceId])
          .primaryKeys();
        await offlineDatabase.snapshots.bulkDelete(existing);
        await offlineDatabase.snapshots.bulkPut(
          response.data.map((wine: WineSummary) => ({
            id: `${prefix}:${wine.id}`,
            spaceId,
            updatedAt: new Date().toISOString(),
            userId: user.uid,
            wine,
          })),
        );
      });
      globalThis.dispatchEvent(new CustomEvent(memoryChangedEvent, { detail: { spaceId } }));
    },
    [user],
  );

  const refreshSessions = useCallback(
    async (spaceId: string) => {
      if (user === null) return;
      // Session clients load on demand so their schemas stay out of the
      // initial bundle while offline replay keeps working.
      const { listTastingSessions } = await import("../services/tasting");
      const response = await listTastingSessions(user, spaceId);
      await cacheSessionList(user.uid, spaceId, response.data);
    },
    [user],
  );

  const applyPhaseThreeMutation = useCallback(
    async (mutation: QueuedMutation) => {
      if (user === null) return;
      const idempotencyKey = await idempotencyKeyForMutation(mutation.id);
      const {
        addTastingSessionWines,
        createDeepTastingNote,
        createTastingSession,
        reorderTastingSessionWines,
        submitDeepTastingNote,
        updateDeepTastingNote,
      } = await import("../services/tasting");
      if (mutation.resourceType === "tasting_session") {
        await createTastingSession(
          user,
          mutation.spaceId,
          CreateTastingSessionRequestSchema.parse(mutation.payload),
          idempotencyKey,
        );
        return;
      }
      if (mutation.resourceType === "session_wines") {
        const detail = await addTastingSessionWines(
          user,
          mutation.spaceId,
          mutation.resourceId,
          AddSessionWinesRequestSchema.parse(mutation.payload),
          idempotencyKey,
        );
        await cacheSessionDetail(user.uid, mutation.spaceId, detail);
        return;
      }
      if (mutation.resourceType === "session_order") {
        const request = ReorderSessionWinesRequestSchema.parse(mutation.payload);
        const detail = await reorderTastingSessionWines(
          user,
          mutation.spaceId,
          mutation.resourceId,
          request.orderedSessionWineIds,
        );
        await cacheSessionDetail(user.uid, mutation.spaceId, detail);
        return;
      }
      if (mutation.resourceType === "deep_tasting_note") {
        const request = DeepTastingRequestSchema.parse(mutation.payload.request);
        const submit = mutation.payload.submit === true;
        const note =
          mutation.baseVersion === undefined
            ? await createDeepTastingNote(
                user,
                mutation.spaceId,
                { ...request, state: submit ? "submitted" : "draft" },
                idempotencyKey,
              )
            : await updateDeepTastingNote(
                user,
                mutation.spaceId,
                mutation.resourceId,
                deepUpdateRequest(request, mutation.baseVersion),
              );
        const synced =
          submit && note.state === "draft"
            ? await submitDeepTastingNote(user, mutation.spaceId, note.id, note.version)
            : note;
        await storeSyncedDeepNote(user.uid, mutation.spaceId, synced);
      }
    },
    [user],
  );

  const flush = useCallback(
    async (requestedSpaceId?: string) => {
      const spaceId = requestedSpaceId ?? activeSpaceId;
      if (user === null || !navigator.onLine || flushing.current.has(spaceId)) {
        await refreshStatus();
        return;
      }
      flushing.current.add(spaceId);
      setStatus("syncing");
      try {
        const mutations = await offlineDatabase.mutations
          .where("[userId+spaceId]")
          .equals([user.uid, spaceId])
          .filter((mutation) => mutation.state === "queued" || mutation.state === "syncing")
          .sortBy("occurredAt");
        if (mutations.length === 0) {
          await Promise.all([refreshMemory(spaceId), refreshSessions(spaceId)]);
          setStatus("synced");
          return;
        }

        const batch = mutations.slice(0, 50);
        for (const mutation of batch) {
          if (mutation.resourceType !== "wine_record" || mutation.localMedia === undefined)
            continue;
          const media = mutation.localMedia;
          const reservation = await reserveMedia(
            user,
            spaceId,
            {
              byteSize: media.byteSize,
              height: media.height,
              kind: "label",
              mimeType: media.mimeType,
              sha256: media.sha256,
              width: media.width,
            },
            media.idempotencyKey,
          );
          const mediaId = await uploadMedia(user, reservation.data.uploadPath, media.blob);
          mutation.payload = { ...mutation.payload, mediaId };
          delete mutation.localMedia;
          await offlineDatabase.mutations.put(mutation);
          void identifyWine(user, spaceId, {
            locale: bootstrap.data.user.preferredLocale,
            mediaId,
          }).catch(() => undefined);
        }

        await offlineDatabase.mutations.bulkPut(
          batch.map((mutation) => ({ ...mutation, state: "syncing" as const })),
        );
        const metadataId = partitionId(user.uid, spaceId);
        const metadata = (await offlineDatabase.syncMetadata.get(metadataId)) ?? {
          cursor: null,
          deviceId: createUlid(),
          id: metadataId,
          spaceId,
          userId: user.uid,
        };
        const phaseTwo = batch.filter(isPhaseTwoMutation);
        const response = await syncSpace(user, spaceId, {
          cursor: metadata.cursor,
          deviceId: metadata.deviceId,
          mutations: phaseTwo.map(asSyncMutation),
        });
        for (const result of response.data.mutationResults) {
          const mutation = phaseTwo.find((candidate) => candidate.id === result.mutationId);
          if (mutation === undefined) continue;
          if (result.status === "applied" || result.status === "replayed") {
            await offlineDatabase.mutations.delete(mutation.id);
          } else {
            await offlineDatabase.mutations.put({
              ...mutation,
              lastError: result.code ?? "SYNC_REJECTED",
              state: "needs_attention",
            });
            await offlineDatabase.conflicts.put({
              id: mutation.id,
              localPayload: mutation.payload,
              resourceId: mutation.resourceId,
              resourceType: mutation.resourceType,
              serverPayload: result.current,
              spaceId,
              userId: user.uid,
            });
          }
        }
        for (const mutation of batch.filter((candidate) => !isPhaseTwoMutation(candidate))) {
          try {
            await applyPhaseThreeMutation(mutation);
            await offlineDatabase.mutations.delete(mutation.id);
          } catch (error) {
            if (!(error instanceof ApiError) || error.status >= 500) throw error;
            await offlineDatabase.mutations.put({
              ...mutation,
              lastError: error.code,
              state: "needs_attention",
            });
            await offlineDatabase.conflicts.put({
              id: mutation.id,
              localPayload: mutation.payload,
              resourceId: mutation.resourceId,
              resourceType: mutation.resourceType,
              ...(error.details?.current === undefined
                ? {}
                : { serverPayload: error.details.current }),
              spaceId,
              userId: user.uid,
            });
          }
        }
        await offlineDatabase.syncMetadata.put({
          ...metadata,
          cursor: response.data.nextCursor,
        });
        await Promise.all([refreshMemory(spaceId), refreshSessions(spaceId)]);
        globalThis.dispatchEvent(new CustomEvent(sessionsChangedEvent, { detail: { spaceId } }));
      } catch {
        const syncing = await offlineDatabase.mutations
          .where("[userId+spaceId]")
          .equals([user.uid, spaceId])
          .filter((mutation) => mutation.state === "syncing")
          .toArray();
        await offlineDatabase.mutations.bulkPut(
          syncing.map((mutation) => ({ ...mutation, state: "queued" as const })),
        );
      } finally {
        flushing.current.delete(spaceId);
        await refreshStatus();
      }
    },
    [
      activeSpaceId,
      applyPhaseThreeMutation,
      bootstrap.data.user.preferredLocale,
      refreshMemory,
      refreshSessions,
      refreshStatus,
      user,
    ],
  );

  const queueDraft = useCallback(
    async (draft: QuickLogDraft) => {
      const now = new Date().toISOString();
      const wineMutation: QueuedMutation = {
        id: draft.wineMutationId,
        occurredAt: now,
        operation: "create",
        payload: draft.winePayload,
        resourceId: draft.wineId,
        resourceType: "wine_record",
        spaceId: draft.spaceId,
        state: "queued",
        userId: draft.userId,
        ...(draft.photo === undefined ? {} : { localMedia: draft.photo }),
      };
      const mutations: QueuedMutation[] = [wineMutation];
      if (draft.includeNote) {
        mutations.push({
          id: draft.noteMutationId,
          // The wine is the note's parent resource. Keep their replay order
          // deterministic even when Dexie sorts records with identical clocks.
          occurredAt: new Date(Date.parse(now) + 1).toISOString(),
          operation: "create",
          payload: { ...draft.notePayload, wineId: draft.wineId },
          resourceId: draft.noteId,
          resourceType: "tasting_note",
          spaceId: draft.spaceId,
          state: "queued",
          userId: draft.userId,
        });
      }
      await offlineDatabase.transaction(
        "rw",
        offlineDatabase.drafts,
        offlineDatabase.mutations,
        async () => {
          await offlineDatabase.mutations.bulkPut(mutations);
          await offlineDatabase.drafts.delete(draft.id);
        },
      );
      setStatus(navigator.onLine ? "saved" : "offline");
      await refreshStatus();
      if (navigator.onLine) void flush(draft.spaceId);
    },
    [flush, refreshStatus],
  );

  const clearOfflineData = useCallback(async () => {
    if (user === null) return;
    await clearOfflineDataForUser(user.uid);
    await refreshStatus();
  }, [refreshStatus, user]);

  useEffect(() => {
    if (userId.length === 0) return;
    void purgeUnavailableSpaces(userId, allowedSpaceIds).then(refreshStatus);
  }, [allowedSpaceIds, refreshStatus, userId]);

  useEffect(() => {
    const online = () => void flush();
    const offline = () => setStatus("offline");
    const visible = () => {
      if (document.visibilityState === "visible") void flush();
    };
    globalThis.addEventListener("online", online);
    globalThis.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", visible);
    if (navigator.onLine) queueMicrotask(() => void flush());
    return () => {
      globalThis.removeEventListener("online", online);
      globalThis.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [flush]);

  const value = useMemo(
    () => ({ clearOfflineData, flush, pendingCount, queueDraft, refreshStatus, status }),
    [clearOfflineData, flush, pendingCount, queueDraft, refreshStatus, status],
  );
  return <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>;
}
