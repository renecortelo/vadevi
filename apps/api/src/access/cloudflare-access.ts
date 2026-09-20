import { z } from "zod";

import type { WorkerBindings } from "../types";
import { normalizeEmail } from "./allowlist";

/**
 * A second factor for the administrator's routes, from Cloudflare Access.
 *
 * The allowlist decides who may use the application. The administrator's
 * routes — the list itself — are the one place where a stolen Google session
 * would do lasting harm, so they can be put behind Cloudflare Access as well:
 * an Access application on this origin for `/settings/access` and
 * `/api/v1/admin/*`, with a policy naming the administrators, is enforced at
 * Cloudflare's edge before a request reaches this Worker, and hands the
 * Worker a signed JWT saying who passed.
 *
 * The Worker checks that JWT itself rather than trusting that the edge did —
 * so the routes fail closed if the Access application is ever removed by
 * mistake — and, more to the point, checks that the person who passed Access
 * is the SAME person whose Firebase token this request carries. Two factors
 * for one identity, not one each for two.
 *
 * Optional: with `ACCESS_TEAM_DOMAIN` and `ACCESS_ADMIN_AUD` unset nothing here
 * runs, and the admin routes rest on the allowlist alone.
 */
const HeaderSchema = z.object({ alg: z.literal("RS256"), kid: z.string().min(1) });

const ClaimsSchema = z.object({
  aud: z.union([z.string(), z.array(z.string())]),
  email: z.string().email().max(254),
  exp: z.number().int().positive(),
  iat: z.number().int().positive().optional(),
  iss: z.string().min(1),
  nbf: z.number().int().positive().optional(),
});

const CertsSchema = z.object({
  keys: z.array(
    z.object({
      alg: z.literal("RS256"),
      e: z.string().min(1),
      kid: z.string().min(1),
      kty: z.literal("RSA"),
      n: z.string().min(1),
    }),
  ),
});

export type AccessConfiguration = Readonly<{ aud: string; teamDomain: string }>;

/**
 * The second door's settings, read three ways: `off` when neither is set —
 * the public default, and a decision; `on` when both are set and well
 * formed; `invalid` for anything in between — one of the two, or a value
 * that cannot be a team or an audience. Invalid used to read as off, so a
 * door the operator had configured with a typo guarded nothing and said so
 * to nobody. It now closes the administrator's routes until it is fixed.
 */
export type AccessSetup =
  | { kind: "invalid"; reason: string }
  | { kind: "off" }
  | { kind: "on"; configuration: AccessConfiguration };

export function accessSetup(bindings: WorkerBindings): AccessSetup {
  const teamDomain = bindings.ACCESS_TEAM_DOMAIN?.trim() ?? "";
  const aud = bindings.ACCESS_ADMIN_AUD?.trim() ?? "";
  if (teamDomain.length === 0 && aud.length === 0) return { kind: "off" };
  if (teamDomain.length === 0 || aud.length === 0) {
    return { kind: "invalid", reason: "ACCESS_TEAM_DOMAIN and ACCESS_ADMIN_AUD go together" };
  }
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(teamDomain)) {
    return { kind: "invalid", reason: "ACCESS_TEAM_DOMAIN is not a team name" };
  }
  if (!/^[a-f0-9]{64}$/.test(aud)) {
    return { kind: "invalid", reason: "ACCESS_ADMIN_AUD is not a 64-hex audience tag" };
  }
  return { configuration: { aud, teamDomain }, kind: "on" };
}

/** The second door's configuration when it is on, else null. */
export function accessConfiguration(bindings: WorkerBindings): AccessConfiguration | null {
  const setup = accessSetup(bindings);
  return setup.kind === "on" ? setup.configuration : null;
}

export class AccessVerificationError extends Error {
  override readonly name = "AccessVerificationError";
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new AccessVerificationError("malformed");
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw new AccessVerificationError("malformed");
  }
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
  } catch (error) {
    if (error instanceof AccessVerificationError) throw error;
    throw new AccessVerificationError("malformed");
  }
}

type KeyCache = { expiresAt: number; keys: Map<string, CryptoKey> };
const keyCaches = new Map<string, KeyCache>();

/** Cloudflare publishes each team's signing keys at a fixed, public URL. */
export type CertificateFetcher = (url: string) => Promise<Response>;

async function signingKey(
  configuration: AccessConfiguration,
  kid: string,
  fetchCertificates: CertificateFetcher,
): Promise<CryptoKey> {
  const url = `https://${configuration.teamDomain}.cloudflareaccess.com/cdn-cgi/access/certs`;
  let cache = keyCaches.get(url);
  if (cache === undefined || cache.expiresAt <= Date.now() || !cache.keys.has(kid)) {
    const response = await fetchCertificates(url);
    if (!response.ok) throw new AccessVerificationError("keys unavailable");
    const certs = CertsSchema.safeParse(await response.json());
    if (!certs.success) throw new AccessVerificationError("keys malformed");
    const keys = new Map<string, CryptoKey>();
    await Promise.all(
      certs.data.keys.map(async (jwk) => {
        keys.set(
          jwk.kid,
          await crypto.subtle.importKey(
            "jwk",
            { alg: jwk.alg, e: jwk.e, kty: jwk.kty, n: jwk.n },
            { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
            false,
            ["verify"],
          ),
        );
      }),
    );
    // Keys rotate rarely; an hour bounds how long a rotated-out key is honoured
    // and how long a new one goes unrecognised — a miss refreshes at once.
    cache = { expiresAt: Date.now() + 60 * 60 * 1_000, keys };
    keyCaches.set(url, cache);
  }
  const key = cache.keys.get(kid);
  if (key === undefined) throw new AccessVerificationError("unknown key");
  return key;
}

/**
 * The e-mail Cloudflare Access vouches for in this JWT, or a thrown
 * AccessVerificationError. Every claim that could be wrong is checked: the
 * signature against the team's published key, the audience against this
 * application's tag, the issuer against the team, and the validity window.
 */
export async function verifyAccessJwt(
  token: string,
  configuration: AccessConfiguration,
  options: { fetchCertificates?: CertificateFetcher; nowSeconds?: number } = {},
): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new AccessVerificationError("malformed");
  const [encodedHeader, encodedPayload, encodedSignature] = parts as [string, string, string];
  const header = HeaderSchema.safeParse(decodeSegment(encodedHeader));
  if (!header.success) throw new AccessVerificationError("header");
  const claims = ClaimsSchema.safeParse(decodeSegment(encodedPayload));
  if (!claims.success) throw new AccessVerificationError("claims");

  const audiences = Array.isArray(claims.data.aud) ? claims.data.aud : [claims.data.aud];
  if (!audiences.includes(configuration.aud)) throw new AccessVerificationError("audience");
  if (claims.data.iss !== `https://${configuration.teamDomain}.cloudflareaccess.com`) {
    throw new AccessVerificationError("issuer");
  }
  const now = options.nowSeconds ?? Math.floor(Date.now() / 1_000);
  if (claims.data.exp <= now) throw new AccessVerificationError("expired");
  if (claims.data.nbf !== undefined && claims.data.nbf > now + 60) {
    throw new AccessVerificationError("not yet valid");
  }

  const key = await signingKey(
    configuration,
    header.data.kid,
    options.fetchCertificates ?? ((url) => fetch(url, { headers: { Accept: "application/json" } })),
  );
  const verified = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    key,
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) throw new AccessVerificationError("signature");
  return normalizeEmail(claims.data.email);
}

/** Cloudflare Access hands the JWT to the origin in this header. */
export const accessJwtHeader = "Cf-Access-Jwt-Assertion";
