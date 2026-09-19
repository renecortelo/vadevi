import { ErrorEnvelopeSchema, InvitationPreviewResponseSchema } from "@vadevi/contracts";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createApi } from "../src/app";
import { randomOpaqueToken } from "../src/security/opaque-token";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The door, attacked.
 *
 * `access.test.ts` shows the door works for the people it is meant for. This
 * file is the other half: everything an outsider might try against a private
 * deployment, and the assertion that none of it lets them in, changes
 * anything, or tells them who is inside. Where the answer is a refusal it is
 * also checked to be a refusal with no side effect: no user row, no Space, no
 * audit line — the bootstrap that used to run on any valid token never runs.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const admin = { email: "keeper@example.test", sub: "hardening-admin" };
const guest = { email: "guest@example.test", sub: "hardening-guest" };
const stranger = { email: "stranger@example.test", sub: "hardening-stranger" };

const privateDeployment = {
  ...env,
  ACCESS_MODE: "allowlist" as const,
  ADMIN_EMAILS: "keeper@example.test",
};

/** A deployment that is NOT the emulator: unsigned tokens must not pass. */
const realDeployment = {
  ...privateDeployment,
  APP_ENV: "preview" as const,
  FIREBASE_AUTH_EMULATOR_HOST: undefined,
  FIREBASE_PROJECT_ID: "vadevi-real-project",
};

function bearer(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function tokenFor(who: { email: string; sub: string }, overrides: Record<string, unknown> = {}) {
  // A display name that is not the address: the preview shows the inviter's
  // name by design, and the test below checks it shows nobody's address.
  return emulatorIdToken({ email: who.email, name: who.sub, sub: who.sub, ...overrides });
}

async function call(
  path: string,
  init: RequestInit,
  bindings: Record<string, unknown> = privateDeployment,
) {
  return createApi().request(path, init, bindings);
}

async function count(sql: string, ...binds: unknown[]): Promise<number> {
  const row = await env.DB.prepare(sql)
    .bind(...binds)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

async function snapshot() {
  return {
    audits: await count(`SELECT COUNT(*) AS total FROM audit_events`),
    spaces: await count(`SELECT COUNT(*) AS total FROM spaces`),
    users: await count(`SELECT COUNT(*) AS total FROM users`),
    wines: await count(`SELECT COUNT(*) AS total FROM wine_records`),
  };
}

/** The families of authenticated routes, one representative each. */
const ulid = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
const protectedRequests: [string, RequestInit][] = [
  ["/api/v1/me/bootstrap", {}],
  ["/api/v1/me", { body: JSON.stringify({ displayName: "x" }), method: "PATCH" }],
  ["/api/v1/me/deletion", { body: JSON.stringify({ confirm: true }), method: "POST" }],
  ["/api/v1/spaces", { body: JSON.stringify({ name: "x", type: "group" }), method: "POST" }],
  [`/api/v1/spaces/${ulid}`, {}],
  [`/api/v1/spaces/${ulid}/wines`, {}],
  [
    `/api/v1/spaces/${ulid}/wines`,
    {
      body: JSON.stringify({ displayName: "x", producerName: "y" }),
      headers: { "Idempotency-Key": randomOpaqueToken() },
      method: "POST",
    },
  ],
  [`/api/v1/spaces/${ulid}/sync`, {}],
  [`/api/v1/spaces/${ulid}/export`, {}],
  [`/api/v1/spaces/${ulid}/media/${ulid}/content`, {}],
  [`/api/v1/spaces/${ulid}/assistant/turns`, { body: JSON.stringify({}), method: "POST" }],
  [`/api/v1/spaces/${ulid}/invitations`, { body: JSON.stringify({}), method: "POST" }],
  [`/api/v1/spaces/${ulid}/usage`, {}],
  ["/api/v1/invitations/some-token/accept", { method: "POST" }],
  ["/api/v1/admin/allowed-accounts", {}],
  [
    "/api/v1/admin/allowed-accounts",
    { body: JSON.stringify({ email: stranger.email }), method: "POST" },
  ],
  [`/api/v1/admin/allowed-accounts/${encodeURIComponent(admin.email)}`, { method: "DELETE" }],
];

describe("an outsider with a valid identity and no entry", () => {
  it("is refused on every authenticated route, and nothing is created", async () => {
    const before = await snapshot();
    for (const [path, init] of protectedRequests) {
      const response = await call(path, {
        ...init,
        headers: { ...bearer(tokenFor(stranger)), ...(init.headers ?? {}) },
      });
      expect(response.status, `${init.method ?? "GET"} ${path}`).toBe(403);
      expect(ErrorEnvelopeSchema.parse(await response.json()).error.code).toBe("ACCESS_DENIED");
    }
    expect(await snapshot()).toEqual(before);
  });

  it("cannot let themselves in, remove the administrator, or read the list", async () => {
    const attempts: [string, RequestInit][] = [
      [
        "/api/v1/admin/allowed-accounts",
        { body: JSON.stringify({ email: stranger.email }), method: "POST" },
      ],
      [`/api/v1/admin/allowed-accounts/${encodeURIComponent(admin.email)}`, { method: "DELETE" }],
      ["/api/v1/admin/allowed-accounts", {}],
    ];
    for (const [path, init] of attempts) {
      const response = await call(path, { ...init, headers: bearer(tokenFor(stranger)) });
      expect(response.status).toBe(403);
    }
    expect(
      await count(
        `SELECT COUNT(*) AS total FROM allowed_accounts WHERE email_normalized = ?`,
        stranger.email,
      ),
    ).toBe(0);
  });

  it("is not let in by a look-alike address", async () => {
    // A domain that contains the administrator's, a subdomain of it, a
    // prefix, and the address with a plus tag: none of them is the address.
    for (const email of [
      "keeper@example.test.attacker.invalid",
      "keeper@sub.example.test",
      "xkeeper@example.test",
      "keeper+admin@example.test",
      "keeper@example.tests",
    ]) {
      const response = await call("/api/v1/me/bootstrap", {
        headers: bearer(tokenFor({ email, sub: `hardening-lookalike-${email.length}` })),
      });
      expect(response.status, email).toBe(403);
    }
    // A homoglyph (Cyrillic е for Latin e) is a different string to the
    // comparison as well; the check is byte equality after lower-casing, with
    // no normalisation that could fold one script into another.
    const { normalizeEmail } = await import("../src/access/allowlist");
    expect(normalizeEmail("k\u0435eper@example.test")).not.toBe(normalizeEmail(admin.email));
  });

  it("cannot take up an invitation to a Space, and the invitation is not consumed", async () => {
    // The administrator makes a Space and an invitation, as a member would.
    const bootstrap = await call("/api/v1/me/bootstrap", { headers: bearer(tokenFor(admin)) });
    expect(bootstrap.status).toBe(200);
    const created = await call("/api/v1/spaces", {
      body: JSON.stringify({ defaultLocale: "en", name: "Hardening Table", type: "group" }),
      headers: { ...bearer(tokenFor(admin)), "Idempotency-Key": randomOpaqueToken() },
      method: "POST",
    });
    expect(created.status).toBe(201);
    const spaceId = (await created.json<{ data: { space: { id: string } } }>()).data.space.id;
    const invited = await call(`/api/v1/spaces/${spaceId}/invitations`, {
      body: JSON.stringify({ intendedRole: "member" }),
      headers: { ...bearer(tokenFor(admin)), "Idempotency-Key": randomOpaqueToken() },
      method: "POST",
    });
    expect(invited.status).toBe(201);
    const token = (
      await invited.json<{ data: { invitationPath: string } }>()
    ).data.invitationPath.split("/invitations/")[1]!;

    // The stranger holds the link. The preview is public by design and says
    // only what a link's recipient needs; it names no member.
    const preview = await call(`/api/v1/invitations/${token}/preview`, {});
    expect(preview.status).toBe(200);
    const previewBody = InvitationPreviewResponseSchema.parse(await preview.json());
    expect(JSON.stringify(previewBody)).not.toContain("@");

    // Accepting it is refused, and the link is still unused.
    const accept = await call(`/api/v1/invitations/${token}/accept`, {
      headers: bearer(tokenFor(stranger)),
      method: "POST",
    });
    expect(accept.status).toBe(403);
    expect((await call(`/api/v1/invitations/${token}/preview`, {})).status).toBe(200);
    expect(
      await count(
        `SELECT COUNT(*) AS total FROM space_memberships m JOIN users u ON u.id = m.user_id WHERE m.space_id = ? AND u.email_normalized = ?`,
        spaceId,
        stranger.email,
      ),
    ).toBe(0);
  });
});

describe("a listed guest", () => {
  it("gets in, but cannot reach the list or promote themselves", async () => {
    const added = await call("/api/v1/admin/allowed-accounts", {
      body: JSON.stringify({ email: guest.email }),
      headers: bearer(tokenFor(admin)),
      method: "POST",
    });
    expect(added.status).toBe(200);
    expect((await call("/api/v1/me/bootstrap", { headers: bearer(tokenFor(guest)) })).status).toBe(
      200,
    );

    for (const [path, init] of [
      ["/api/v1/admin/allowed-accounts", {}],
      [
        "/api/v1/admin/allowed-accounts",
        { body: JSON.stringify({ email: stranger.email }), method: "POST" },
      ],
      [`/api/v1/admin/allowed-accounts/${encodeURIComponent(admin.email)}`, { method: "DELETE" }],
    ] as [string, RequestInit][]) {
      const response = await call(path, { ...init, headers: bearer(tokenFor(guest)) });
      expect(response.status, path).toBe(403);
      expect(ErrorEnvelopeSchema.parse(await response.json()).error.code).toBe("FORBIDDEN");
    }
    expect(
      await count(
        `SELECT COUNT(*) AS total FROM allowed_accounts WHERE email_normalized = ?`,
        stranger.email,
      ),
    ).toBe(0);
  });

  it("is out the moment they are removed, mid-session", async () => {
    await call(`/api/v1/admin/allowed-accounts/${encodeURIComponent(guest.email)}`, {
      headers: bearer(tokenFor(admin)),
      method: "DELETE",
    });
    // The same token that worked a moment ago.
    const response = await call("/api/v1/me/bootstrap", { headers: bearer(tokenFor(guest)) });
    expect(response.status).toBe(403);
  });
});

describe("the token itself", () => {
  it("must be signed by the project outside the emulator: an unsigned token is refused", async () => {
    // Exactly the token the emulator accepts, presented to a real deployment.
    const response = await call(
      "/api/v1/me/bootstrap",
      { headers: bearer(tokenFor(admin)) },
      realDeployment,
    );
    expect(response.status).toBe(401);
  });

  it("must be for this project", async () => {
    for (const overrides of [
      { aud: "another-project" },
      { iss: "https://securetoken.google.com/another-project" },
    ]) {
      const response = await call("/api/v1/me/bootstrap", {
        headers: bearer(tokenFor(admin, overrides)),
      });
      expect(response.status, JSON.stringify(overrides)).toBe(401);
    }
  });

  it("must not have expired, and must not be from the future", async () => {
    const now = Math.floor(Date.now() / 1_000);
    for (const overrides of [
      { exp: now - 60 },
      { iat: now + 3_600, exp: now + 7_200 },
      { auth_time: now + 3_600 },
    ]) {
      const response = await call("/api/v1/me/bootstrap", {
        headers: bearer(tokenFor(admin, overrides)),
      });
      expect(response.status, JSON.stringify(overrides)).toBe(401);
    }
  });

  it("must be a token at all", async () => {
    for (const header of [
      "Bearer",
      "Bearer ",
      "Bearer not-a-jwt",
      "Bearer a.b",
      `Bearer ${"x".repeat(20_000)}`,
      "Basic a2VlcGVyOnBhc3N3b3Jk",
      `Token ${tokenFor(admin)}`,
      `Bearer ${tokenFor(admin)} extra`,
    ]) {
      const response = await call("/api/v1/me/bootstrap", {
        headers: { Authorization: header },
      });
      expect(response.status, header.slice(0, 24)).toBe(401);
    }
    expect((await call("/api/v1/me/bootstrap", {})).status).toBe(401);
  });

  it("cannot carry a claim that makes someone an administrator", async () => {
    // Firebase custom claims, role fields, whatever an attacker might add: the
    // only thing that matters is the e-mail, and that is not on the list.
    const response = await call("/api/v1/admin/allowed-accounts", {
      headers: bearer(
        tokenFor(stranger, {
          admin: true,
          role: "admin",
          roles: ["admin"],
          firebase: { sign_in_provider: "google.com", admin: true },
        }),
      ),
    });
    expect(response.status).toBe(403);
  });
});

describe("what a private deployment tells the public", () => {
  it("sends the browser-side hardening headers on every response, refusals included", async () => {
    for (const path of ["/health", "/api/v1/me/bootstrap", "/api/v1/admin/allowed-accounts"]) {
      const response = await call(path, {});
      const headers = response.headers;
      expect(headers.get("strict-transport-security"), path).toContain("max-age=31536000");
      expect(headers.get("x-content-type-options"), path).toBe("nosniff");
      expect(headers.get("referrer-policy"), path).toBe("no-referrer");
      expect(headers.get("content-security-policy"), path).toContain("frame-ancestors 'none'");
      expect(headers.get("content-security-policy"), path).toContain("form-action 'none'");
    }
  });

  it("keeps the administrators and the mode out of the runtime configuration", async () => {
    const response = await call("/runtime-config", {});
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain("keeper@");
    expect(text).not.toContain("ADMIN_EMAILS");
    expect(text).not.toContain("allowlist");
  });

  it("answers the same 403 to a refused principal whether or not the address exists", async () => {
    // Nothing in the refusal says whether an address is known, has an account,
    // or was once listed: no enumeration through the door.
    const seen = new Set<string>();
    for (const who of [stranger, guest, { email: "never@example.test", sub: "hardening-never" }]) {
      const response = await call("/api/v1/me/bootstrap", { headers: bearer(tokenFor(who)) });
      expect(response.status).toBe(403);
      const body = ErrorEnvelopeSchema.parse(await response.json());
      seen.add(`${body.error.code}|${body.error.message}`);
    }
    expect(seen.size).toBe(1);
  });
});
