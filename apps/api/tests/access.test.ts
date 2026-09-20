import {
  AllowedAccountsResponseSchema,
  BootstrapResponseSchema,
  ErrorEnvelopeSchema,
} from "@vadevi/contracts";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createApi } from "../src/app";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The door of a private deployment.
 *
 * A valid token used to be the whole test: any Google account got an account
 * and a personal Space on its first request. With ACCESS_MODE=allowlist only
 * the e-mails on the list — and the administrators, who keep it — may come in,
 * and nothing is created for anyone else.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const admin = { email: "keeper@example.test", sub: "firebase-emulator-access-admin" };
const guest = { email: "guest@example.test", sub: "firebase-emulator-access-guest" };
const stranger = { email: "stranger@example.test", sub: "firebase-emulator-access-stranger" };

const privateDeployment = {
  ...env,
  ACCESS_MODE: "allowlist" as const,
  // Mixed case and a space on purpose: the configuration is typed by a person.
  ADMIN_EMAILS: " KEEPER@example.test ,",
};

function request(
  path: string,
  who: { email: string; sub: string },
  bindings: Record<string, unknown> = privateDeployment,
  init: RequestInit = {},
) {
  return createApi().request(
    path,
    {
      ...init,
      headers: {
        Authorization: `Bearer ${emulatorIdToken({ email: who.email, name: who.email, sub: who.sub })}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    },
    bindings,
  );
}

async function userCount(email: string): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM users WHERE email_normalized = ? AND deleted_at IS NULL`,
  )
    .bind(email)
    .first<{ total: number }>();
  return row?.total ?? 0;
}

describe("a private deployment", () => {
  it("refuses a stranger before any account is created, and names why", async () => {
    const response = await request("/api/v1/me/bootstrap", stranger);
    expect(response.status).toBe(403);
    const body = ErrorEnvelopeSchema.parse(await response.json());
    expect(body.error.code).toBe("ACCESS_DENIED");
    expect(await userCount(stranger.email)).toBe(0);
  });

  it("lets the administrator in without an entry, and marks them as such", async () => {
    const response = await request("/api/v1/me/bootstrap", admin);
    expect(response.status).toBe(200);
    const bootstrap = BootstrapResponseSchema.parse(await response.json());
    expect(bootstrap.data.features.accessAdmin).toBe(true);
    expect(await userCount(admin.email)).toBe(1);
  });

  it("lets a listed guest in once the administrator adds them, and out again", async () => {
    // Not yet on the list: refused.
    expect((await request("/api/v1/me/bootstrap", guest)).status).toBe(403);

    // The administrator adds them — in whatever case they typed it.
    const added = await request("/api/v1/admin/allowed-accounts", admin, privateDeployment, {
      body: JSON.stringify({ email: "GUEST@example.test", note: "tasting group" }),
      method: "POST",
    });
    expect(added.status).toBe(200);
    const list = AllowedAccountsResponseSchema.parse(await added.json());
    expect(list.data.mode).toBe("allowlist");
    expect(list.data.admins).toEqual([admin.email]);
    const entry = list.data.accounts.find((account) => account.email === guest.email);
    expect(entry).toMatchObject({ note: "tasting group", userId: null });

    // Now they come in, get an account, and are not an administrator.
    const welcome = await request("/api/v1/me/bootstrap", guest);
    expect(welcome.status).toBe(200);
    expect(BootstrapResponseSchema.parse(await welcome.json()).data.features.accessAdmin).toBe(
      false,
    );
    // The list now shows that they have signed in.
    const after = AllowedAccountsResponseSchema.parse(
      await (await request("/api/v1/admin/allowed-accounts", admin)).json(),
    );
    expect(after.data.accounts.find((account) => account.email === guest.email)?.userId).not.toBe(
      null,
    );

    // Removed: refused again on the next request, and the account still exists
    // — removal closes the door, it does not delete anything.
    const removed = await request(
      `/api/v1/admin/allowed-accounts/${encodeURIComponent(guest.email)}`,
      admin,
      privateDeployment,
      { method: "DELETE" },
    );
    expect(removed.status).toBe(200);
    expect((await request("/api/v1/me/bootstrap", guest)).status).toBe(403);
    expect(await userCount(guest.email)).toBe(1);
  });

  it("keeps the list to administrators", async () => {
    await request("/api/v1/admin/allowed-accounts", admin, privateDeployment, {
      body: JSON.stringify({ email: guest.email }),
      method: "POST",
    });
    const response = await request("/api/v1/admin/allowed-accounts", guest);
    expect(response.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(await response.json()).error.code).toBe("FORBIDDEN");
  });

  it("does not take an unverified e-mail as anyone's — not the administrator's, not a guest's", async () => {
    // A token whose provider did not vouch for the address. Google's always
    // do; a provider enabled later — e-mail and password before the
    // confirmation link — would not, and its token could name any address.
    const unverified = (who: { email: string; sub: string }) =>
      createApi().request(
        "/api/v1/me/bootstrap",
        {
          headers: {
            Authorization: `Bearer ${emulatorIdToken({
              email: who.email,
              email_verified: false,
              name: who.email,
              sub: `${who.sub}-unverified`,
            })}`,
          },
        },
        privateDeployment,
      );
    // The administrator's own address, unverified: refused, and no account.
    const impostor = await unverified(admin);
    expect(impostor.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(await impostor.json()).error.code).toBe("ACCESS_DENIED");
    // A listed guest's address, unverified: refused as well.
    await request("/api/v1/admin/allowed-accounts", admin, privateDeployment, {
      body: JSON.stringify({ email: guest.email }),
      method: "POST",
    });
    expect((await unverified(guest)).status).toBe(403);
    // An open deployment does not authorize by e-mail and is unchanged.
    const open = await createApi().request(
      "/api/v1/me/bootstrap",
      {
        headers: {
          Authorization: `Bearer ${emulatorIdToken({
            email: stranger.email,
            email_verified: false,
            name: stranger.email,
            sub: `${stranger.sub}-unverified-open`,
          })}`,
        },
      },
      { ...env, ACCESS_MODE: "open" },
    );
    expect(open.status).toBe(200);
  });

  it("closes the door on every authenticated route, not only the bootstrap", async () => {
    const response = await request("/api/v1/spaces/01ARZ3NDEKTSV4RRFFQ69G5FAV/wines", stranger);
    expect(response.status).toBe(403);
  });
});

describe("a misspelled door", () => {
  it("fails closed for everyone, the administrator included, and says why", async () => {
    // "allowlst": the operator meant to close the door. Reading the typo as
    // "open" would have let the world in with no sign that anything was wrong.
    const newcomer = { email: "newcomer@example.test", sub: "firebase-emulator-access-newcomer" };
    for (const who of [newcomer, admin]) {
      const response = await request("/api/v1/me/bootstrap", who, {
        ...privateDeployment,
        ACCESS_MODE: "allowlst",
      });
      expect(response.status).toBe(503);
      expect(ErrorEnvelopeSchema.parse(await response.json()).error.code).toBe("MISCONFIGURED");
    }
    expect(await userCount(newcomer.email)).toBe(0);
  });
});

describe("an open deployment", () => {
  it("lets anyone this Firebase project authenticates in, as before", async () => {
    const response = await request("/api/v1/me/bootstrap", stranger, {
      ...env,
      ACCESS_MODE: "open",
    });
    expect(response.status).toBe(200);
    expect(BootstrapResponseSchema.parse(await response.json()).data.features.accessAdmin).toBe(
      false,
    );
  });

  it("is what an unset ACCESS_MODE means", async () => {
    const response = await request("/api/v1/me/bootstrap", stranger, { ...env });
    expect(response.status).toBe(200);
  });
});
