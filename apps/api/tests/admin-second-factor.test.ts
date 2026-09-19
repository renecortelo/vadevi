import { ErrorEnvelopeSchema } from "@vadevi/contracts";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { createApi } from "../src/app";
import { emulatorIdToken } from "./fixtures/firebase-token";

/**
 * The second door on the administrator's routes.
 *
 * With Cloudflare Access configured, the Worker does not take the edge's word
 * for it: it verifies Access's JWT itself — signature against the team's
 * published key, audience, issuer, validity — and requires the e-mail Access
 * vouches for to be the e-mail of the Firebase identity making the request.
 * These tests sign real JWTs with a key generated here and serve its public
 * half the way Cloudflare's certs endpoint would.
 */
beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

const admin = { email: "keeper@example.test", sub: "second-factor-admin" };
const teamDomain = "vadevi-team";
const aud = "a".repeat(64);
const otherAud = "b".repeat(64);

function base64Url(bytes: ArrayBuffer | Uint8Array | string): string {
  const raw =
    typeof bytes === "string"
      ? bytes
      : String.fromCharCode(...(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)));
  return btoa(raw).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

type Signer = {
  certs: Response;
  sign: (claims: Record<string, unknown>, kid?: string) => Promise<string>;
};

async function makeSigner(kid = "kid-1"): Promise<Signer> {
  const pair = (await crypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey("jwk", pair.publicKey)) as JsonWebKey;
  const certs = new Response(
    JSON.stringify({ keys: [{ alg: "RS256", e: jwk.e, kid, kty: "RSA", n: jwk.n }] }),
    { headers: { "Content-Type": "application/json" }, status: 200 },
  );
  return {
    certs,
    sign: async (claims, useKid = kid) => {
      const head = base64Url(JSON.stringify({ alg: "RS256", kid: useKid, typ: "JWT" }));
      const body = base64Url(JSON.stringify(claims));
      const signature = await crypto.subtle.sign(
        { name: "RSASSA-PKCS1-v1_5" },
        pair.privateKey,
        new TextEncoder().encode(`${head}.${body}`),
      );
      return `${head}.${body}.${base64Url(signature)}`;
    },
  };
}

function accessClaims(email: string, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1_000);
  return {
    aud: [aud],
    email,
    exp: now + 600,
    iat: now - 5,
    iss: `https://${teamDomain}.cloudflareaccess.com`,
    nbf: now - 5,
    ...overrides,
  };
}

describe("the administrator's routes behind Cloudflare Access", () => {
  it("verifies the Access JWT against the team's key, and binds it to the same e-mail", async () => {
    const signer = await makeSigner();
    const { verifyAccessJwt } = await import("../src/access/cloudflare-access");
    const configuration = { aud, teamDomain };
    const fetchCertificates = async () => signer.certs.clone();

    await expect(
      verifyAccessJwt(await signer.sign(accessClaims("KEEPER@example.test")), configuration, {
        fetchCertificates,
      }),
    ).resolves.toBe("keeper@example.test");

    for (const [label, claims, kid] of [
      ["another audience", accessClaims(admin.email, { aud: [otherAud] })],
      ["another team", accessClaims(admin.email, { iss: "https://other.cloudflareaccess.com" })],
      ["expired", accessClaims(admin.email, { exp: Math.floor(Date.now() / 1_000) - 1 })],
      ["not yet valid", accessClaims(admin.email, { nbf: Math.floor(Date.now() / 1_000) + 3_600 })],
      ["no e-mail", { ...accessClaims(admin.email), email: undefined }],
      ["unknown key", accessClaims(admin.email), "kid-unknown"],
    ] as [string, Record<string, unknown>, string?][]) {
      await expect(
        verifyAccessJwt(await signer.sign(claims, kid), configuration, { fetchCertificates }),
        label,
      ).rejects.toThrow();
    }

    // Signed by somebody else's key: the signature does not verify.
    const impostor = await makeSigner("kid-1");
    await expect(
      verifyAccessJwt(await impostor.sign(accessClaims(admin.email)), configuration, {
        fetchCertificates,
      }),
    ).rejects.toThrow(/signature/);
  });

  it("refuses the admin routes without the JWT, and names the second factor", async () => {
    const response = await createApi().request(
      "/api/v1/admin/allowed-accounts",
      {
        headers: {
          Authorization: `Bearer ${emulatorIdToken({ email: admin.email, name: "Keeper", sub: admin.sub })}`,
        },
      },
      {
        ...env,
        ACCESS_ADMIN_AUD: aud,
        ACCESS_MODE: "allowlist",
        ACCESS_TEAM_DOMAIN: teamDomain,
        ADMIN_EMAILS: admin.email,
      },
    );
    expect(response.status).toBe(403);
    expect(ErrorEnvelopeSchema.parse(await response.json()).error.code).toBe(
      "SECOND_FACTOR_REQUIRED",
    );

    // The rest of the application is untouched by the second door.
    const bootstrap = await createApi().request(
      "/api/v1/me/bootstrap",
      {
        headers: {
          Authorization: `Bearer ${emulatorIdToken({ email: admin.email, name: "Keeper", sub: admin.sub })}`,
        },
      },
      {
        ...env,
        ACCESS_ADMIN_AUD: aud,
        ACCESS_MODE: "allowlist",
        ACCESS_TEAM_DOMAIN: teamDomain,
        ADMIN_EMAILS: admin.email,
      },
    );
    expect(bootstrap.status).toBe(200);
    expect(
      (await bootstrap.json<{ data: { features: { accessSecondFactor: boolean } } }>()).data
        .features.accessSecondFactor,
    ).toBe(true);
  });

  it("does nothing until both settings are present", async () => {
    for (const partial of [
      {},
      { ACCESS_TEAM_DOMAIN: teamDomain },
      { ACCESS_ADMIN_AUD: aud },
      { ACCESS_ADMIN_AUD: "short", ACCESS_TEAM_DOMAIN: teamDomain },
    ]) {
      const response = await createApi().request(
        "/api/v1/admin/allowed-accounts",
        {
          headers: {
            Authorization: `Bearer ${emulatorIdToken({ email: admin.email, name: "Keeper", sub: admin.sub })}`,
          },
        },
        { ...env, ACCESS_MODE: "allowlist", ADMIN_EMAILS: admin.email, ...partial },
      );
      expect(response.status, JSON.stringify(partial)).toBe(200);
    }
  });
});
