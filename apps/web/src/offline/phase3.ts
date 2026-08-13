import type {
  CreateTastingSessionRequest,
  DeepTastingNote,
  DeepTastingRequest,
  SessionComparisonResponse,
  TastingSessionDetailResponse,
  TastingSessionResponse,
  WineSummary,
} from "@vadevi/contracts";
import { DeepTastingRequestSchema } from "@vadevi/contracts";

import { createUlid } from "../security/ulid";
import {
  type DeepTastingDraft,
  offlineDatabase,
  partitionId,
  type QueuedMutation,
  type TastingSessionSnapshot,
} from "./database";
import { deepTastingChangedEvent, sessionsChangedEvent } from "./events";

type SessionWine = TastingSessionDetailResponse["data"]["wines"][number];

export function sessionSnapshotId(userId: string, spaceId: string, sessionId: string): string {
  return `${partitionId(userId, spaceId)}:${sessionId}`;
}

export function deepDraftId(
  userId: string,
  spaceId: string,
  wineId: string,
  sessionWineId?: string | null,
): string {
  return `${partitionId(userId, spaceId)}:${sessionWineId ?? `wine:${wineId}`}`;
}

export function deepNoteToRequest(note: DeepTastingNote): DeepTastingRequest {
  const responseFields = new Set([
    "authorUserId",
    "createdAt",
    "id",
    "ontologyVersion",
    "updatedAt",
    "version",
  ]);
  const request = Object.fromEntries(
    Object.entries(note).filter(([key, value]) => !responseFields.has(key) && value !== null),
  );
  return DeepTastingRequestSchema.parse(request);
}

export async function cacheSessionList(
  userId: string,
  spaceId: string,
  sessions: TastingSessionResponse["data"][],
): Promise<void> {
  const updatedAt = new Date().toISOString();
  const [existing, pendingMutations] = await Promise.all([
    offlineDatabase.tastingSessions.where("[userId+spaceId]").equals([userId, spaceId]).toArray(),
    offlineDatabase.mutations
      .where("[userId+spaceId]")
      .equals([userId, spaceId])
      .filter((mutation) => mutation.resourceType === "tasting_session")
      .toArray(),
  ]);
  const existingBySession = new Map(existing.map((snapshot) => [snapshot.sessionId, snapshot]));
  const records = sessions.map((session) => {
    const cached = existingBySession.get(session.id);
    return {
      comparison: cached?.comparison ?? null,
      detail: {
        data: {
          session,
          wines: cached?.detail.data.wines ?? [],
        },
      },
      id: sessionSnapshotId(userId, spaceId, session.id),
      sessionId: session.id,
      spaceId,
      updatedAt,
      userId,
    } satisfies TastingSessionSnapshot;
  });
  await offlineDatabase.transaction("rw", offlineDatabase.tastingSessions, async () => {
    const serverIds = new Set(sessions.map((session) => session.id));
    const pendingIds = new Set(pendingMutations.map((mutation) => mutation.resourceId));
    const staleIds = existing
      .filter(
        (snapshot) => !serverIds.has(snapshot.sessionId) && !pendingIds.has(snapshot.sessionId),
      )
      .map((snapshot) => snapshot.id);
    await offlineDatabase.tastingSessions.bulkDelete(staleIds);
    await offlineDatabase.tastingSessions.bulkPut(records);
  });
  globalThis.dispatchEvent(new CustomEvent(sessionsChangedEvent, { detail: { spaceId } }));
}

export async function cacheSessionDetail(
  userId: string,
  spaceId: string,
  detail: TastingSessionDetailResponse,
  comparison?: SessionComparisonResponse | null,
): Promise<void> {
  const id = sessionSnapshotId(userId, spaceId, detail.data.session.id);
  const existing = await offlineDatabase.tastingSessions.get(id);
  await offlineDatabase.tastingSessions.put({
    comparison: comparison === undefined ? (existing?.comparison ?? null) : comparison,
    detail,
    id,
    sessionId: detail.data.session.id,
    spaceId,
    updatedAt: new Date().toISOString(),
    userId,
  });
  globalThis.dispatchEvent(new CustomEvent(sessionsChangedEvent, { detail: { spaceId } }));
}

export async function queueNewSession(options: {
  createdByUserId: string;
  request: CreateTastingSessionRequest;
  selectedWines: WineSummary[];
  spaceId: string;
  userId: string;
}): Promise<string> {
  const now = new Date().toISOString();
  const sessionId = options.request.clientId ?? createUlid();
  const entries = options.selectedWines.map((wine) => ({ clientId: createUlid(), wine }));
  const detail: TastingSessionDetailResponse = {
    data: {
      session: {
        createdAt: now,
        createdByUserId: options.createdByUserId,
        description: options.request.description ?? null,
        endsAt: options.request.endsAt ?? null,
        id: sessionId,
        name: options.request.name,
        startsAt: options.request.startsAt,
        status: options.request.status,
        submittedNoteCount: 0,
        venueText: options.request.venueText ?? null,
        version: 1,
        wineCount: entries.length,
      },
      wines: entries.map((entry, position) => ({
        id: entry.clientId,
        ownNoteId: null,
        ownNoteState: null,
        position,
        servingLabel: null,
        submittedNoteCount: 0,
        version: 1,
        wine: entry.wine,
      })),
    },
  };
  const mutations: QueuedMutation[] = [
    {
      id: createUlid(),
      occurredAt: now,
      operation: "create",
      payload: { ...options.request, clientId: sessionId },
      resourceId: sessionId,
      resourceType: "tasting_session",
      spaceId: options.spaceId,
      state: "queued",
      userId: options.userId,
    },
  ];
  if (entries.length > 0) {
    mutations.push({
      id: createUlid(),
      occurredAt: new Date(Date.parse(now) + 1).toISOString(),
      operation: "create",
      payload: {
        entries: entries.map((entry) => ({
          clientId: entry.clientId,
          wineId: entry.wine.id,
        })),
      },
      resourceId: sessionId,
      resourceType: "session_wines",
      spaceId: options.spaceId,
      state: "queued",
      userId: options.userId,
    });
  }
  await offlineDatabase.transaction(
    "rw",
    offlineDatabase.mutations,
    offlineDatabase.tastingSessions,
    async () => {
      await offlineDatabase.tastingSessions.put({
        comparison: null,
        detail,
        id: sessionSnapshotId(options.userId, options.spaceId, sessionId),
        sessionId,
        spaceId: options.spaceId,
        updatedAt: now,
        userId: options.userId,
      });
      await offlineDatabase.mutations.bulkPut(mutations);
    },
  );
  globalThis.dispatchEvent(
    new CustomEvent(sessionsChangedEvent, { detail: { spaceId: options.spaceId } }),
  );
  return sessionId;
}

export async function queueSessionWines(options: {
  sessionId: string;
  spaceId: string;
  userId: string;
  wines: WineSummary[];
}): Promise<void> {
  if (options.wines.length === 0) return;
  const snapshotId = sessionSnapshotId(options.userId, options.spaceId, options.sessionId);
  const snapshot = await offlineDatabase.tastingSessions.get(snapshotId);
  if (snapshot === undefined) throw new Error("The session is not cached on this device.");
  const now = new Date().toISOString();
  const entries = options.wines.map((wine) => ({ clientId: createUlid(), wine }));
  await offlineDatabase.transaction(
    "rw",
    offlineDatabase.mutations,
    offlineDatabase.tastingSessions,
    async () => {
      await offlineDatabase.tastingSessions.put({
        ...snapshot,
        detail: {
          data: {
            session: {
              ...snapshot.detail.data.session,
              wineCount: snapshot.detail.data.wines.length + entries.length,
            },
            wines: [
              ...snapshot.detail.data.wines,
              ...entries.map((entry, offset) => ({
                id: entry.clientId,
                ownNoteId: null,
                ownNoteState: null,
                position: snapshot.detail.data.wines.length + offset,
                servingLabel: null,
                submittedNoteCount: 0,
                version: 1,
                wine: entry.wine,
              })),
            ],
          },
        },
        updatedAt: now,
      });
      await offlineDatabase.mutations.put({
        id: createUlid(),
        occurredAt: now,
        operation: "create",
        payload: {
          entries: entries.map((entry) => ({
            clientId: entry.clientId,
            wineId: entry.wine.id,
          })),
        },
        resourceId: options.sessionId,
        resourceType: "session_wines",
        spaceId: options.spaceId,
        state: "queued",
        userId: options.userId,
      });
    },
  );
  globalThis.dispatchEvent(
    new CustomEvent(sessionsChangedEvent, { detail: { spaceId: options.spaceId } }),
  );
}

export async function queueSessionOrder(options: {
  orderedSessionWineIds: string[];
  sessionId: string;
  spaceId: string;
  userId: string;
}): Promise<void> {
  const snapshotId = sessionSnapshotId(options.userId, options.spaceId, options.sessionId);
  const snapshot = await offlineDatabase.tastingSessions.get(snapshotId);
  if (snapshot === undefined) throw new Error("The session is not cached on this device.");
  const byId = new Map<string, SessionWine>(
    snapshot.detail.data.wines.map((entry: SessionWine) => [entry.id, entry]),
  );
  const ordered = options.orderedSessionWineIds.map((id, position) => {
    const entry = byId.get(id);
    if (entry === undefined) throw new Error("The exact flight is not cached on this device.");
    return { ...entry, position };
  });
  if (ordered.length !== snapshot.detail.data.wines.length) {
    throw new Error("The exact flight is not cached on this device.");
  }
  const now = new Date().toISOString();
  await offlineDatabase.transaction(
    "rw",
    offlineDatabase.mutations,
    offlineDatabase.tastingSessions,
    async () => {
      await offlineDatabase.tastingSessions.put({
        ...snapshot,
        detail: { data: { ...snapshot.detail.data, wines: ordered } },
        updatedAt: now,
      });
      const older = await offlineDatabase.mutations
        .where("[userId+spaceId]")
        .equals([options.userId, options.spaceId])
        .filter(
          (mutation) =>
            mutation.resourceType === "session_order" &&
            mutation.resourceId === options.sessionId &&
            mutation.state === "queued",
        )
        .primaryKeys();
      await offlineDatabase.mutations.bulkDelete(older);
      await offlineDatabase.mutations.put({
        id: createUlid(),
        occurredAt: now,
        operation: "reorder",
        payload: { orderedSessionWineIds: options.orderedSessionWineIds },
        resourceId: options.sessionId,
        resourceType: "session_order",
        spaceId: options.spaceId,
        state: "queued",
        userId: options.userId,
      });
    },
  );
  globalThis.dispatchEvent(
    new CustomEvent(sessionsChangedEvent, { detail: { spaceId: options.spaceId } }),
  );
}

export async function queueDeepTasting(draft: DeepTastingDraft, submit: boolean): Promise<void> {
  const now = new Date().toISOString();
  await offlineDatabase.transaction(
    "rw",
    offlineDatabase.deepDrafts,
    offlineDatabase.mutations,
    async () => {
      const older = await offlineDatabase.mutations
        .where("[userId+spaceId]")
        .equals([draft.userId, draft.spaceId])
        .filter(
          (mutation) =>
            mutation.resourceType === "deep_tasting_note" &&
            mutation.resourceId === draft.noteId &&
            mutation.state === "queued",
        )
        .primaryKeys();
      await offlineDatabase.mutations.bulkDelete(older);
      await offlineDatabase.deepDrafts.put({ ...draft, updatedAt: now });
      await offlineDatabase.mutations.put({
        ...(draft.note === null ? {} : { baseVersion: draft.note.version }),
        id: createUlid(),
        occurredAt: now,
        operation: "save",
        payload: { request: { ...draft.payload, clientId: draft.noteId }, submit },
        resourceId: draft.noteId,
        resourceType: "deep_tasting_note",
        spaceId: draft.spaceId,
        state: "queued",
        userId: draft.userId,
      });
    },
  );
  globalThis.dispatchEvent(
    new CustomEvent(deepTastingChangedEvent, { detail: { spaceId: draft.spaceId } }),
  );
}

export async function storeSyncedDeepNote(
  userId: string,
  spaceId: string,
  note: DeepTastingNote,
): Promise<void> {
  const draft = await offlineDatabase.deepDrafts.where("noteId").equals(note.id).first();
  if (draft === undefined || draft.userId !== userId || draft.spaceId !== spaceId) return;
  await offlineDatabase.deepDrafts.put({
    ...draft,
    note,
    payload: {
      ...draft.payload,
      clientId: note.id,
      state: note.state,
    },
    updatedAt: new Date().toISOString(),
  });
  globalThis.dispatchEvent(new CustomEvent(deepTastingChangedEvent, { detail: { spaceId } }));
}
