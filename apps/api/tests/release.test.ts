import {
  BootstrapResponseSchema,
  CreateWineResponseSchema,
  DeletionJobResponseSchema,
  ErrorEnvelopeSchema,
  ExportDocumentSchema,
  MergeWinesResponseSchema,
  SpaceDetailResponseSchema,
  UsageReportResponseSchema,
  WineMemoryResponseSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { runDueDeletionJobs } from "../src/repositories/deletion";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const ownerToken = emulatorIdToken({
  email: "release-owner@example.test",
  name: "Release Owner",
  sub: "firebase-emulator-user-phase-6-owner",
});
const memberToken = emulatorIdToken({
  email: "release-member@example.test",
  name: "Release Member",
  sub: "firebase-emulator-user-phase-6-member",
});
const outsiderToken = emulatorIdToken({
  email: "release-outsider@example.test",
  name: "Release Outsider",
  sub: "firebase-emulator-user-phase-6-outsider",
});

function headers(token: string, idempotencyKey?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(idempotencyKey === undefined ? {} : { "Idempotency-Key": idempotencyKey }),
  };
}

async function bootstrap(token: string) {
  const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(response.status).toBe(200);
  return BootstrapResponseSchema.parse(await response.json());
}

async function createWine(
  spaceId: string,
  token: string,
  wine: Record<string, unknown>,
): Promise<{ id: string; version: number }> {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
    body: JSON.stringify({ identityStatus: "confirmed", nonVintage: false, ...wine }),
    headers: headers(token, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
  const created = CreateWineResponseSchema.parse(await response.json()).data.wine;
  return { id: created.id, version: created.version };
}

async function createQuickNote(
  spaceId: string,
  token: string,
  note: Record<string, unknown>,
): Promise<void> {
  const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/tasting-notes`, {
    body: JSON.stringify({
      descriptorCodes: [],
      mode: "quick",
      state: "submitted",
      ...note,
    }),
    headers: headers(token, randomOpaqueToken()),
    method: "POST",
  });
  expect(response.status).toBe(201);
}

async function sharedSpace(): Promise<string> {
  const owner = await bootstrap(ownerToken);
  await bootstrap(memberToken);
  await bootstrap(outsiderToken);

  const created = await SELF.fetch("https://vadevi.test/api/v1/spaces", {
    body: JSON.stringify({ defaultLocale: "en", name: "Phase Six Group", type: "group" }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  expect(created.status).toBe(201);
  const spaceId = SpaceDetailResponseSchema.parse(await created.json()).data.space.id;
  expect(owner.data.user.activeSpaceId).toBeTruthy();

  const invitation = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/invitations`, {
    body: JSON.stringify({ intendedRole: "member" }),
    headers: headers(ownerToken, randomOpaqueToken()),
    method: "POST",
  });
  expect(invitation.status).toBe(201);
  const invitationPath = invitation.headers.get("Location")!;
  const token = invitationPath.split("/").at(-1)!;
  const accepted = await SELF.fetch(`https://vadevi.test/api/v1/invitations/${token}/accept`, {
    headers: headers(memberToken),
    method: "POST",
  });
  expect(accepted.status).toBe(200);
  return spaceId;
}

describe("Export (AC-063)", () => {
  it("produces a versioned JSON document and never includes media bytes implicitly", async () => {
    const spaceId = await sharedSpace();
    const wine = await createWine(spaceId, ownerToken, {
      countryCode: "ES",
      displayName: "Exportable Red",
      producerName: "Synthetic Export Producer",
      region: "Penedès",
      vintageYear: 2021,
      wineType: "red",
    });
    await createQuickNote(spaceId, ownerToken, {
      score100: 91,
      sentiment: "like",
      tastedAt: "2026-08-10T19:00:00.000Z",
      wineId: wine.id,
    });

    const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/export`, {
      headers: headers(ownerToken),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    const document = ExportDocumentSchema.parse(await response.json());
    expect(document.data.schemaVersion).toBe("2026.1");
    expect(document.data.scope).toBe("space");
    expect(document.data.space.id).toBe(spaceId);
    expect(document.data.wines.map((entry: { id: string }) => entry.id)).toContain(wine.id);
    expect(document.data.tastings).toHaveLength(1);
    // Media is announced as a selection requirement rather than embedded.
    for (const asset of document.data.media as { selectionRequired: boolean }[]) {
      expect(asset.selectionRequired).toBe(true);
    }
  });

  it("limits a member export to their own contributions and shared wine metadata", async () => {
    const spaceId = await sharedSpace();
    const ownerWine = await createWine(spaceId, ownerToken, {
      displayName: "Owner Only Note Wine",
      producerName: "Synthetic Export Producer",
      vintageYear: 2019,
      wineType: "red",
    });
    await createQuickNote(spaceId, ownerToken, {
      comment: "An owner-authored submitted note.",
      score100: 88,
      tastedAt: "2026-08-11T19:00:00.000Z",
      wineId: ownerWine.id,
    });
    await createQuickNote(spaceId, memberToken, {
      comment: "A member-authored draft that must stay private.",
      state: "draft",
      tastedAt: "2026-08-12T19:00:00.000Z",
      wineId: ownerWine.id,
    });

    const memberResponse = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/export`, {
      headers: headers(memberToken),
    });
    expect(memberResponse.status).toBe(200);
    const memberDocument = ExportDocumentSchema.parse(await memberResponse.json());
    expect(memberDocument.data.scope).toBe("own");
    // Shared wine metadata stays readable; another member's note does not.
    expect(memberDocument.data.wines.map((entry: { id: string }) => entry.id)).toContain(
      ownerWine.id,
    );
    expect(memberDocument.data.tastings).toHaveLength(1);
    expect(memberDocument.data.tastings[0]?.state).toBe("draft");

    const ownerResponse = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/export`, {
      headers: headers(ownerToken),
    });
    const ownerDocument = ExportDocumentSchema.parse(await ownerResponse.json());
    // Even a Space export withholds another member's unsubmitted draft.
    expect(
      ownerDocument.data.tastings.some((note: { comment: string | null }) =>
        note.comment?.includes("draft that must stay private"),
      ),
    ).toBe(false);
  });

  it("renders a selected CSV dataset with formula-guarded cells", async () => {
    const spaceId = await sharedSpace();
    await createWine(spaceId, ownerToken, {
      displayName: "=SUM(A1:A9) Injection Attempt",
      producerName: "Synthetic Export Producer",
      vintageYear: 2020,
      wineType: "white",
    });

    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/export?format=csv&dataset=wines`,
      { headers: headers(ownerToken) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
    const csv = await response.text();
    expect(csv.split("\r\n")[0]).toContain('"displayName"');
    expect(csv).toContain(`"'=SUM(A1:A9) Injection Attempt"`);
  });

  it("rejects a CSV export without an explicit dataset and denies an outsider", async () => {
    const spaceId = await sharedSpace();
    const invalid = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/export?format=csv`,
      { headers: headers(ownerToken) },
    );
    expect(invalid.status).toBe(400);

    const outsider = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/export`, {
      headers: headers(outsiderToken),
    });
    expect(outsider.status).toBe(404);
    expect(ErrorEnvelopeSchema.parse(await outsider.json()).error.code).toBe("NOT_FOUND");
  });

  it("packages only explicitly selected authorized media", async () => {
    const spaceId = await sharedSpace();
    const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/export/media`, {
      body: JSON.stringify({ confirm: true, mediaIds: ["01JZZZZZZZZZZZZZZZZZZZZZZZ"] }),
      headers: headers(ownerToken),
      method: "POST",
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/zip");
    // An unauthorized id is skipped rather than reported, so the archive is empty.
    expect(response.headers.get("X-Media-Count")).toBe("0");
    const archive = new Uint8Array(await response.arrayBuffer());
    expect(archive.byteLength).toBe(22);
  });
});

describe("Deletion (AC-064)", () => {
  it("requires a typed confirmation, is idempotent, and is cancelable", async () => {
    const spaceId = await sharedSpace();

    const mismatched = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/deletion`, {
      body: JSON.stringify({ confirm: true, confirmationText: "Wrong Name" }),
      headers: headers(ownerToken),
      method: "POST",
    });
    expect(mismatched.status).toBe(400);

    const request = () =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/deletion`, {
        body: JSON.stringify({ confirm: true, confirmationText: "Phase Six Group" }),
        headers: headers(ownerToken),
        method: "POST",
      });

    const first = await request();
    expect(first.status).toBe(202);
    const firstJob = DeletionJobResponseSchema.parse(await first.json()).data;
    expect(firstJob.state).toBe("scheduled");
    expect(firstJob.gracePeriodSeconds).toBeGreaterThan(0);

    const replay = await request();
    expect(replay.status).toBe(202);
    // Repeated confirmation returns the same job instead of scheduling a second purge.
    expect(DeletionJobResponseSchema.parse(await replay.json()).data.id).toBe(firstJob.id);

    const canceled = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/deletion/cancel`,
      { headers: headers(ownerToken), method: "POST" },
    );
    expect(canceled.status).toBe(200);
    expect(DeletionJobResponseSchema.parse(await canceled.json()).data.state).toBe("canceled");
  });

  it("denies Space deletion to a non-owner member and to an outsider", async () => {
    const spaceId = await sharedSpace();
    for (const token of [memberToken, outsiderToken]) {
      const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/deletion`, {
        body: JSON.stringify({ confirm: true, confirmationText: "Phase Six Group" }),
        headers: headers(token),
        method: "POST",
      });
      expect(response.status).toBe(404);
    }
  });

  it("lets a member leave a shared Space idempotently without deleting shared records", async () => {
    const spaceId = await sharedSpace();
    const wine = await createWine(spaceId, ownerToken, {
      displayName: "Shared After Leaving",
      producerName: "Synthetic Export Producer",
      vintageYear: 2018,
      wineType: "red",
    });

    const leave = () =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/leave`, {
        body: JSON.stringify({ confirm: true, pseudonymizeAuthorship: false }),
        headers: headers(memberToken),
        method: "POST",
      });

    expect((await leave()).status).toBe(200);
    expect((await leave()).status).toBe(200);

    // The former member loses server access on the next request.
    const denied = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      headers: headers(memberToken),
    });
    expect(denied.status).toBe(404);

    // The shared record survives.
    const remaining = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      headers: headers(ownerToken),
    });
    const wines = WineMemoryResponseSchema.parse(await remaining.json());
    expect(wines.data.map((entry: { id: string }) => entry.id)).toContain(wine.id);
  });

  it("refuses to leave a personal Space", async () => {
    const owner = await bootstrap(ownerToken);
    const personal = owner.data.spaces.find(
      (space: { type: string }) => space.type === "personal",
    )!;
    const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${personal.id}/leave`, {
      body: JSON.stringify({ confirm: true, pseudonymizeAuthorship: false }),
      headers: headers(ownerToken),
      method: "POST",
    });
    expect(response.status).toBe(400);
  });

  it("schedules account deletion idempotently after a recent sign-in", async () => {
    const staleToken = emulatorIdToken({
      auth_time: Math.floor(Date.now() / 1_000) - 3_600,
      email: "release-stale@example.test",
      name: "Release Stale",
      sub: "firebase-emulator-user-phase-6-stale",
    });
    await bootstrap(staleToken);
    const stale = await SELF.fetch("https://vadevi.test/api/v1/me/deletion", {
      body: JSON.stringify({ confirm: true, confirmationText: "DELETE" }),
      headers: headers(staleToken),
      method: "POST",
    });
    expect(stale.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(await stale.json()).error.code).toBe("FORBIDDEN");

    const freshToken = emulatorIdToken({
      email: "release-fresh@example.test",
      name: "Release Fresh",
      sub: "firebase-emulator-user-phase-6-fresh",
    });
    await bootstrap(freshToken);
    const request = () =>
      SELF.fetch("https://vadevi.test/api/v1/me/deletion", {
        body: JSON.stringify({ confirm: true, confirmationText: "DELETE" }),
        headers: headers(freshToken),
        method: "POST",
      });
    const first = await request();
    expect(first.status).toBe(202);
    const job = DeletionJobResponseSchema.parse(await first.json()).data;
    expect(job.targetType).toBe("account");
    const replay = await request();
    expect(DeletionJobResponseSchema.parse(await replay.json()).data.id).toBe(job.id);
  });
});

describe("Deletion executor (AC-064)", () => {
  it("purges Space rows and R2 media once, and stays a no-op when re-run", async () => {
    const spaceId = await sharedSpace();
    const wine = await createWine(spaceId, ownerToken, {
      displayName: "Purgeable Wine",
      producerName: "Synthetic Purge Producer",
      vintageYear: 2014,
      wineType: "red",
    });
    await createQuickNote(spaceId, ownerToken, {
      score100: 77,
      tastedAt: "2026-08-04T19:00:00.000Z",
      wineId: wine.id,
    });

    // A ready media asset with real bytes proves the R2 objects are removed too.
    const owner = await bootstrap(ownerToken);
    const mediaId = "01JMEDIA0000000000000PURGE";
    const r2Key = `private/${mediaId}`;
    await env.MEDIA.put(r2Key, new Uint8Array([1, 2, 3]));
    await env.DB.prepare(
      `INSERT INTO media_assets (
        id, space_id, owner_user_id, kind, r2_key, mime_type, byte_size, sha256,
        width, height, processing_status, expires_at, created_at, updated_at, deleted_at
      ) VALUES (?, ?, ?, 'label', ?, 'image/jpeg', 3, 'synthetic-hash', 10, 10, 'ready',
        '2030-01-01T00:00:00.000Z', '2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z', NULL)`,
    )
      .bind(mediaId, spaceId, owner.data.user.id, r2Key)
      .run();

    const scheduled = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/deletion`, {
      body: JSON.stringify({ confirm: true, confirmationText: "Phase Six Group" }),
      headers: headers(ownerToken),
      method: "POST",
    });
    expect(scheduled.status).toBe(202);
    const job = DeletionJobResponseSchema.parse(await scheduled.json()).data;

    // Nothing is purged before the grace period elapses.
    const early = await runDueDeletionJobs(env.DB, env.MEDIA, "2026-08-14T00:00:00.000Z");
    expect(early.completed).toBe(0);
    expect(await env.MEDIA.get(r2Key)).not.toBeNull();

    const afterGrace = new Date(Date.parse(job.purgeAfter) + 1_000).toISOString();
    // Other suites may have left their own due jobs, so assert on this one.
    const first = await runDueDeletionJobs(env.DB, env.MEDIA, afterGrace);
    expect(first.completed).toBeGreaterThanOrEqual(1);
    expect(await env.MEDIA.get(r2Key)).toBeNull();

    for (const table of ["wine_records", "tasting_notes", "media_assets", "space_memberships"]) {
      const remaining = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM ${table} WHERE space_id = ?`,
      )
        .bind(spaceId)
        .first<{ total: number }>();
      expect(remaining?.total).toBe(0);
    }
    const space = await env.DB.prepare(`SELECT COUNT(*) AS total FROM spaces WHERE id = ?`)
      .bind(spaceId)
      .first<{ total: number }>();
    expect(space?.total).toBe(0);

    // The job is idempotent: a second pass finds nothing left to do.
    const second = await runDueDeletionJobs(env.DB, env.MEDIA, afterGrace);
    expect(second.completed).toBe(0);

    const completedJob = await env.DB.prepare(`SELECT state FROM deletion_jobs WHERE id = ?`)
      .bind(job.id)
      .first<{ state: string }>();
    expect(completedJob?.state).toBe("completed");

    // The owner loses access to the purged Space on the next request.
    const denied = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      headers: headers(ownerToken),
    });
    expect(denied.status).toBe(404);
  });
});

describe("Usage and budgets (AC-065)", () => {
  it("reports aggregate counters, budgets, and the public provider-disabled default", async () => {
    const spaceId = await sharedSpace();
    const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/usage`, {
      headers: headers(ownerToken),
    });
    expect(response.status).toBe(200);
    const report = UsageReportResponseSchema.parse(await response.json());
    expect(report.data.providers).toEqual({ aiProvider: "none", researchProvider: "none" });
    expect(report.data.thresholds).toEqual({ critical: 0.9, warning: 0.7 });
    expect(report.data.counters.length).toBeGreaterThan(0);
    for (const counter of report.data.counters as { limit: number; used: number }[]) {
      expect(counter.limit).toBeGreaterThan(0);
      expect(counter.used).toBeGreaterThanOrEqual(0);
    }
  });

  it("denies the usage report to an outsider", async () => {
    const spaceId = await sharedSpace();
    const response = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/usage`, {
      headers: headers(outsiderToken),
    });
    expect(response.status).toBe(404);
  });
});

describe("Wine Memory filters and confirmed merge (AC-031, AC-013)", () => {
  it("filters accent-insensitively across the MVP field surface with a stable cursor", async () => {
    const spaceId = await sharedSpace();
    const penedes = await createWine(spaceId, ownerToken, {
      countryCode: "ES",
      displayName: "Filterable Penedes",
      producerName: "Synthetic Filter Producer",
      region: "Penedès",
      vintageYear: 2015,
      wineType: "red",
    });
    const rioja = await createWine(spaceId, ownerToken, {
      countryCode: "ES",
      displayName: "Filterable Rioja",
      producerName: "Synthetic Filter Producer",
      region: "Rioja",
      vintageYear: 2022,
      wineType: "white",
    });
    const loire = await createWine(spaceId, ownerToken, {
      countryCode: "FR",
      displayName: "Filterable Loire",
      producerName: "Synthetic Filter Producer",
      region: "Loire",
      vintageYear: 2020,
      wineType: "white",
    });
    await createQuickNote(spaceId, ownerToken, {
      score100: 95,
      sentiment: "like",
      tastedAt: "2026-08-01T19:00:00.000Z",
      wineId: penedes.id,
    });
    await createQuickNote(spaceId, ownerToken, {
      score100: 61,
      sentiment: "dislike",
      tastedAt: "2026-08-02T19:00:00.000Z",
      wineId: rioja.id,
    });

    const search = async (query: string) => {
      const response = await SELF.fetch(
        `https://vadevi.test/api/v1/spaces/${spaceId}/wines?${query}`,
        { headers: headers(ownerToken) },
      );
      expect(response.status).toBe(200);
      return WineMemoryResponseSchema.parse(await response.json());
    };

    // An unaccented region query matches the accented stored value.
    const byRegion = await search("region=penedes");
    expect(byRegion.data.map((wine: { id: string }) => wine.id)).toEqual([penedes.id]);

    const byCountry = await search("countryCode=fr");
    expect(byCountry.data.map((wine: { id: string }) => wine.id)).toEqual([loire.id]);

    const byVintage = await search("vintageFrom=2020&vintageTo=2022");
    expect(byVintage.data.map((wine: { id: string }) => wine.id).sort()).toEqual(
      [loire.id, rioja.id].sort(),
    );

    const byScore = await search("minScore=90");
    expect(byScore.data.map((wine: { id: string }) => wine.id)).toEqual([penedes.id]);

    const bySentiment = await search("sentiment=dislike");
    expect(bySentiment.data.map((wine: { id: string }) => wine.id)).toEqual([rioja.id]);

    const byMedia = await search("hasMedia=true");
    expect(byMedia.data).toHaveLength(0);

    const byTastedRange = await search(
      "tastedFrom=2026-08-02T00%3A00%3A00.000Z&tastedTo=2026-08-03T00%3A00%3A00.000Z",
    );
    expect(byTastedRange.data.map((wine: { id: string }) => wine.id)).toEqual([rioja.id]);

    const invalid = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines?minScore=90&maxScore=10`,
      { headers: headers(ownerToken) },
    );
    expect(invalid.status).toBe(400);

    // Sorted pagination stays stable and never repeats or drops a record.
    const firstPage = await search("sort=name&limit=1");
    expect(firstPage.page.hasMore).toBe(true);
    const secondPage = await search(
      `sort=name&limit=10&cursor=${encodeURIComponent(firstPage.page.nextCursor!)}`,
    );
    const seen = [...firstPage.data, ...secondPage.data].map((wine: { id: string }) => wine.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain(penedes.id);
    expect(seen).toContain(rioja.id);
    expect(seen).toContain(loire.id);
  });

  it("merges a confirmed duplicate exactly once and preserves references and audit", async () => {
    const spaceId = await sharedSpace();
    const target = await createWine(spaceId, ownerToken, {
      displayName: "Mergeable Target",
      producerName: "Synthetic Merge Producer",
      vintageYear: 2017,
      wineType: "red",
    });
    const source = await createWine(spaceId, ownerToken, {
      displayName: "Mergeable Source",
      producerName: "Synthetic Merge Producer",
      vintageYear: 2017,
      wineType: "red",
    });
    await createQuickNote(spaceId, ownerToken, {
      score100: 84,
      tastedAt: "2026-08-03T19:00:00.000Z",
      wineId: source.id,
    });

    const merge = (body: Record<string, unknown>) =>
      SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines/${target.id}/merge`, {
        body: JSON.stringify(body),
        headers: headers(ownerToken),
        method: "POST",
      });

    const stale = await merge({
      confirm: true,
      sourceVersion: source.version + 5,
      sourceWineId: source.id,
      targetVersion: target.version,
    });
    expect(stale.status).toBe(409);

    const self = await merge({
      confirm: true,
      sourceVersion: target.version,
      sourceWineId: target.id,
      targetVersion: target.version,
    });
    expect(self.status).toBe(400);

    const first = await merge({
      confirm: true,
      sourceVersion: source.version,
      sourceWineId: source.id,
      targetVersion: target.version,
    });
    expect(first.status).toBe(200);
    const merged = MergeWinesResponseSchema.parse(await first.json()).data;
    expect(merged.replayed).toBe(false);
    expect(merged.merged.tastingNotes).toBe(1);
    expect(merged.merged.aliasesAdded).toBe(1);

    // Repeating the confirmed merge does not move rows a second time.
    const replay = await merge({
      confirm: true,
      sourceVersion: source.version,
      sourceWineId: source.id,
      targetVersion: merged.wine.version,
    });
    expect(replay.status).toBe(200);
    const replayed = MergeWinesResponseSchema.parse(await replay.json()).data;
    expect(replayed.replayed).toBe(true);
    expect(replayed.merged.tastingNotes).toBe(0);

    const listed = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/wines`, {
      headers: headers(ownerToken),
    });
    const wines = WineMemoryResponseSchema.parse(await listed.json());
    const ids = wines.data.map((wine: { id: string }) => wine.id);
    expect(ids).toContain(target.id);
    expect(ids).not.toContain(source.id);
    expect(wines.data.find((wine: { id: string }) => wine.id === target.id)?.noteCount).toBe(1);

    // The losing display name survives as a searchable merge alias.
    const aliasSearch = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines?query=Mergeable%20Source`,
      { headers: headers(ownerToken) },
    );
    const aliasResults = WineMemoryResponseSchema.parse(await aliasSearch.json());
    expect(aliasResults.data.map((wine: { id: string }) => wine.id)).toEqual([target.id]);

    const audit = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM audit_events WHERE space_id = ? AND action = 'wine.merged'`,
    )
      .bind(spaceId)
      .first<{ total: number }>();
    expect(audit?.total).toBe(1);

    const exported = await SELF.fetch(`https://vadevi.test/api/v1/spaces/${spaceId}/export`, {
      headers: headers(ownerToken),
    });
    const document = ExportDocumentSchema.parse(await exported.json());
    // The merged record keeps a resolvable tombstone in the export.
    expect(document.data.wines.find((wine: { id: string }) => wine.id === target.id)).toBeDefined();
  });

  it("denies a merge from an outsider", async () => {
    const spaceId = await sharedSpace();
    const target = await createWine(spaceId, ownerToken, {
      displayName: "Outsider Merge Target",
      producerName: "Synthetic Merge Producer",
      vintageYear: 2016,
      wineType: "red",
    });
    const source = await createWine(spaceId, ownerToken, {
      displayName: "Outsider Merge Source",
      producerName: "Synthetic Merge Producer",
      vintageYear: 2016,
      wineType: "red",
    });
    const response = await SELF.fetch(
      `https://vadevi.test/api/v1/spaces/${spaceId}/wines/${target.id}/merge`,
      {
        body: JSON.stringify({
          confirm: true,
          sourceVersion: source.version,
          sourceWineId: source.id,
          targetVersion: target.version,
        }),
        headers: headers(outsiderToken),
        method: "POST",
      },
    );
    expect(response.status).toBe(404);
  });
});
