import { BootstrapResponseSchema, ErrorEnvelopeSchema } from "@vadevi/contracts";
import { applyD1Migrations, env, SELF } from "cloudflare:test";
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
        "space_invitations",
        "space_memberships",
        "spaces",
        "users",
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
        version: "0.1.0",
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
        (SELECT COUNT(*) FROM space_memberships WHERE status = 'active') AS memberships,
        (SELECT COUNT(*) FROM audit_events WHERE action = 'personal_space.created') AS audits`,
    )
      .bind("firebase-emulator-user-phase-1")
      .first<{ audits: number; memberships: number; spaces: number; users: number }>();

    expect(counts).toEqual({ audits: 1, memberships: 1, spaces: 1, users: 1 });
  });
});
