import { BootstrapResponseSchema, ErrorEnvelopeSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
import { ulid } from "ulid";
import { beforeAll, describe, expect, it } from "vitest";

import { emulatorIdToken } from "./fixtures/firebase-token";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("Workers runtime", () => {
  it("applies the identity and spaces migration to a fresh D1 database", async () => {
    const result = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();

    const tables = result.results.map(({ name }) => name);

    expect(tables).toEqual(
      expect.arrayContaining([
        "d1_migrations",
        "assistant_tool_runs",
        "external_adapter_cache",
        "external_rate_windows",
        "facts",
        "fact_citations",
        "research_jobs",
        "space_invitations",
        "space_memberships",
        "spaces",
        "users",
        "sources",
      ]),
    );
  });

  it("serves health through the exported Worker handler", async () => {
    const response = await SELF.fetch("https://vadevi.test/health");

    expect(response.status).toBe(200);
    expect(response.headers.get("X-Request-Id")).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        service: "vadevi-api",
        status: "ok",
        version: "0.5.0",
      },
    });
  });

  it("requires a Firebase bearer token for bootstrap", async () => {
    const response = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap");
    const body = ErrorEnvelopeSchema.parse(await response.json());

    expect(response.status).toBe(401);
    expect(body.error.code).toBe("AUTH_REQUIRED");
  });

  it("creates one user and one personal Space across bootstrap retries", async () => {
    const token = emulatorIdToken();
    const request = () =>
      SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
        headers: { Authorization: `Bearer ${token}` },
      });

    const firstResponse = await request();
    const first = BootstrapResponseSchema.parse(await firstResponse.json());
    const secondResponse = await request();
    const second = BootstrapResponseSchema.parse(await secondResponse.json());

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(second.data.user.id).toBe(first.data.user.id);
    expect(second.data.user.activeSpaceId).toBe(first.data.user.activeSpaceId);
    expect(second.data.spaces).toEqual(first.data.spaces);
    expect(first.data.spaces).toEqual([
      expect.objectContaining({ role: "owner", type: "personal" }),
    ]);

    const counts = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM users WHERE firebase_uid = ?) AS users,
        (SELECT COUNT(*) FROM spaces WHERE type = 'personal' AND deleted_at IS NULL) AS spaces,
        (SELECT COUNT(*)
          FROM space_memberships membership
          JOIN spaces space ON space.id = membership.space_id
          WHERE membership.status = 'active' AND space.type = 'personal') AS memberships,
        (SELECT COUNT(*) FROM audit_events WHERE action = 'personal_space.created') AS audits`,
    )
      .bind("firebase-emulator-user-phase-1")
      .first<{ audits: number; memberships: number; spaces: number; users: number }>();

    expect(counts).toEqual({ audits: 1, memberships: 1, spaces: 1, users: 1 });
  });

  it("writes nothing when the app is opened again and nothing has changed", async () => {
    const sub = "firebase-emulator-user-quiet-bootstrap";
    const open = (email: string) =>
      SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
        headers: { Authorization: `Bearer ${emulatorIdToken({ email, sub })}` },
      });
    const row = () =>
      env.DB.prepare(
        `SELECT email_normalized AS email, updated_at FROM users WHERE firebase_uid = ?`,
      )
        .bind(sub)
        .first<{ email: string; updated_at: string }>();

    expect((await open("quiet@example.test")).status).toBe(200);
    const first = await row();
    await new Promise((resolve) => setTimeout(resolve, 10));

    // The same sign-in again: the row is not rewritten.
    expect((await open("quiet@example.test")).status).toBe(200);
    expect(await row()).toEqual(first);

    // A different e-mail from the provider is still taken.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect((await open("quiet.new@example.test")).status).toBe(200);
    const changed = await row();
    expect(changed?.email).toBe("quiet.new@example.test");
    expect(changed?.updated_at).not.toBe(first?.updated_at);
  });

  it("rejects empty updates and Spaces outside the user's memberships", async () => {
    const token = emulatorIdToken();
    await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
      headers: { Authorization: `Bearer ${token}` },
    });

    const emptyResponse = await SELF.fetch("https://vadevi.test/api/v1/me", {
      body: JSON.stringify({}),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    const emptyBody = ErrorEnvelopeSchema.parse(await emptyResponse.json());

    expect(emptyResponse.status).toBe(400);
    expect(emptyBody.error.code).toBe("VALIDATION_FAILED");

    const unavailableResponse = await SELF.fetch("https://vadevi.test/api/v1/me", {
      body: JSON.stringify({ activeSpaceId: ulid() }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    const unavailableBody = ErrorEnvelopeSchema.parse(await unavailableResponse.json());

    expect(unavailableResponse.status).toBe(404);
    expect(unavailableBody.error.code).toBe("NOT_FOUND");
  });

  it("completes onboarding and switches only to an active Space membership", async () => {
    const token = emulatorIdToken();
    const bootstrapResponse = await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const bootstrap = BootstrapResponseSchema.parse(await bootstrapResponse.json());
    const groupSpaceId = ulid();
    const now = new Date().toISOString();

    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO spaces (
          id, type, name, default_locale, created_by_user_id, version,
          created_at, updated_at, deleted_at
        ) VALUES (?, 'group', 'Friday table', 'en', ?, 1, ?, ?, NULL)`,
      ).bind(groupSpaceId, bootstrap.data.user.id, now, now),
      env.DB.prepare(
        `INSERT INTO space_memberships (
          space_id, user_id, role, status, joined_at, removed_at, version, created_at, updated_at
        ) VALUES (?, ?, 'owner', 'active', ?, NULL, 1, ?, ?)`,
      ).bind(groupSpaceId, bootstrap.data.user.id, now, now, now),
    ]);

    const response = await SELF.fetch("https://vadevi.test/api/v1/me", {
      body: JSON.stringify({
        activeSpaceId: groupSpaceId,
        completeOnboarding: true,
        displayName: "Sample Taster",
        preferredLocale: "ca",
      }),
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      method: "PATCH",
    });
    const body = BootstrapResponseSchema.parse(await response.json());

    expect(response.status).toBe(200);
    expect(body.data.user).toMatchObject({
      activeSpaceId: groupSpaceId,
      displayName: "Sample Taster",
      onboardingComplete: true,
      preferredLocale: "ca",
    });
    expect(body.data.spaces[0]).toMatchObject({
      id: groupSpaceId,
      name: "Friday table",
      role: "owner",
      type: "group",
    });

    const events = await env.DB.prepare(
      `SELECT
        (SELECT COUNT(*) FROM audit_events WHERE action = 'profile.updated') AS audits,
        (SELECT COUNT(*) FROM change_events WHERE resource_type = 'user_profile') AS changes`,
    ).first<{ audits: number; changes: number }>();

    expect(events).toEqual({ audits: 1, changes: 1 });
  });

  it("gives the personal Space the language chosen at onboarding, once and only if untouched", async () => {
    const personalSpace = (userId: string) =>
      env.DB.prepare(
        `SELECT default_locale AS locale, version FROM spaces
        WHERE created_by_user_id = ? AND type = 'personal'`,
      )
        .bind(userId)
        .first<{ locale: string; version: number }>();
    const patchMe = (token: string, update: Record<string, unknown>) =>
      SELF.fetch("https://vadevi.test/api/v1/me", {
        body: JSON.stringify(update),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "PATCH",
      });

    // A new reader: the Space is born in the account's default, English.
    const token = emulatorIdToken({ email: "locale@example.test", sub: "locale-reader" });
    const bootstrap = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json(),
    );
    expect(await personalSpace(bootstrap.data.user.id)).toEqual({ locale: "en", version: 1 });

    // Onboarding in Spanish gives the personal Space Spanish.
    const onboarded = await patchMe(token, { completeOnboarding: true, preferredLocale: "es" });
    expect(onboarded.status).toBe(200);
    expect(await personalSpace(bootstrap.data.user.id)).toEqual({ locale: "es", version: 2 });

    // A later change of the reader's language leaves the Space as it is.
    expect((await patchMe(token, { preferredLocale: "fr" })).status).toBe(200);
    expect(await personalSpace(bootstrap.data.user.id)).toEqual({ locale: "es", version: 2 });

    // A Space edited before onboarding keeps what it was given.
    const editedToken = emulatorIdToken({ email: "edited@example.test", sub: "locale-edited" });
    const edited = BootstrapResponseSchema.parse(
      await (
        await SELF.fetch("https://vadevi.test/api/v1/me/bootstrap", {
          headers: { Authorization: `Bearer ${editedToken}` },
        })
      ).json(),
    );
    await env.DB.prepare(
      `UPDATE spaces SET version = 2 WHERE created_by_user_id = ? AND type = 'personal'`,
    )
      .bind(edited.data.user.id)
      .run();
    expect(
      (await patchMe(editedToken, { completeOnboarding: true, preferredLocale: "it" })).status,
    ).toBe(200);
    expect(await personalSpace(edited.data.user.id)).toEqual({ locale: "en", version: 2 });
  });
});
