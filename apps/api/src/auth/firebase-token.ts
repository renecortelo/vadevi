import { z } from "zod";

import type { FirebasePrincipal, WorkerBindings } from "../types";

const firebaseJwksUrl =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const maximumTokenLength = 16_384;
const clockSkewSeconds = 60;

const JwtHeaderSchema = z
  .object({
    alg: z.string(),
    kid: z.string().min(1).optional(),
    typ: z.string().optional(),
  })
  .passthrough();

const FirebaseClaimsSchema = z
  .object({
    aud: z.string().min(1),
    auth_time: z.number().int().nonnegative(),
    email: z.string().email().max(254).optional(),
    exp: z.number().int().positive(),
    iat: z.number().int().positive(),
    iss: z.string().min(1),
    name: z.string().trim().min(1).max(120).optional(),
    picture: z.string().url().max(2_048).optional(),
    sub: z.string().min(1).max(128),
  })
  .passthrough();

const JsonWebKeySchema = z
  .object({
    alg: z.literal("RS256"),
    e: z.string().min(1),
    kid: z.string().min(1),
    kty: z.literal("RSA"),
    n: z.string().min(1),
    use: z.literal("sig").optional(),
  })
  .passthrough();

const JsonWebKeySetSchema = z.object({
  keys: z.array(JsonWebKeySchema).min(1),
});

type SigningKeyCache = {
  expiresAt: number;
  keys: Map<string, CryptoKey>;
};

let signingKeyCache: SigningKeyCache | undefined;

export class FirebaseConfigurationError extends Error {
  override readonly name = "FirebaseConfigurationError";
}

export class FirebaseTokenVerificationError extends Error {
  override readonly name = "FirebaseTokenVerificationError";
}

function invalidToken(): FirebaseTokenVerificationError {
  return new FirebaseTokenVerificationError("The Firebase ID token is invalid.");
}

function decodeBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw invalidToken();
  }

  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  try {
    return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw invalidToken();
  }
}

function decodeJsonSegment(segment: string): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(decodeBase64Url(segment)));
  } catch (error) {
    if (error instanceof FirebaseTokenVerificationError) {
      throw error;
    }
    throw invalidToken();
  }
}

function parseMaximumAge(cacheControl: string | null): number {
  const match = /(?:^|,)\s*max-age=(\d+)/i.exec(cacheControl ?? "");
  const seconds = match?.[1] === undefined ? 300 : Number.parseInt(match[1], 10);
  return Math.min(Math.max(seconds, 60), 86_400) * 1_000;
}

async function refreshSigningKeys(): Promise<SigningKeyCache> {
  const response = await fetch(firebaseJwksUrl, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new FirebaseConfigurationError("Firebase signing keys are unavailable.");
  }

  const jwks = JsonWebKeySetSchema.safeParse(await response.json());
  if (!jwks.success) {
    throw new FirebaseConfigurationError("Firebase signing keys are malformed.");
  }

  const keys = new Map<string, CryptoKey>();
  await Promise.all(
    jwks.data.keys.map(async (jwk) => {
      const keyData: JsonWebKey = {
        alg: jwk.alg,
        e: jwk.e,
        kty: jwk.kty,
        n: jwk.n,
        ...(jwk.use === undefined ? {} : { use: jwk.use }),
      };
      const key = await crypto.subtle.importKey(
        "jwk",
        keyData,
        { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
        false,
        ["verify"],
      );
      keys.set(jwk.kid, key);
    }),
  );

  return {
    expiresAt: Date.now() + parseMaximumAge(response.headers.get("Cache-Control")),
    keys,
  };
}

async function signingKey(kid: string): Promise<CryptoKey> {
  if (signingKeyCache === undefined || signingKeyCache.expiresAt <= Date.now()) {
    signingKeyCache = await refreshSigningKeys();
  }

  let key = signingKeyCache.keys.get(kid);
  if (key === undefined) {
    signingKeyCache = await refreshSigningKeys();
    key = signingKeyCache.keys.get(kid);
  }

  if (key === undefined) {
    throw invalidToken();
  }
  return key;
}

function validateClaims(
  claims: z.infer<typeof FirebaseClaimsSchema>,
  projectId: string,
  nowSeconds: number,
): void {
  if (
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    claims.exp <= nowSeconds - clockSkewSeconds ||
    claims.iat > nowSeconds + clockSkewSeconds ||
    claims.auth_time > nowSeconds + clockSkewSeconds
  ) {
    throw invalidToken();
  }
}

function toPrincipal(claims: z.infer<typeof FirebaseClaimsSchema>): FirebasePrincipal {
  return {
    authTime: claims.auth_time,
    firebaseUid: claims.sub,
    ...(claims.email === undefined ? {} : { email: claims.email.toLowerCase() }),
    ...(claims.name === undefined ? {} : { displayName: claims.name }),
    ...(claims.picture === undefined ? {} : { avatarUrl: claims.picture }),
  };
}

function isEmulatorMode(bindings: WorkerBindings): boolean {
  return (
    bindings.APP_ENV === "local" &&
    bindings.FIREBASE_PROJECT_ID?.startsWith("demo-") === true &&
    /^(?:127\.0\.0\.1|localhost):\d+$/.test(bindings.FIREBASE_AUTH_EMULATOR_HOST ?? "")
  );
}

export async function verifyFirebaseIdToken(
  token: string,
  bindings: WorkerBindings,
  nowSeconds = Math.floor(Date.now() / 1_000),
): Promise<FirebasePrincipal> {
  const projectId = bindings.FIREBASE_PROJECT_ID;
  if (projectId === undefined || projectId.length === 0) {
    throw new FirebaseConfigurationError("FIREBASE_PROJECT_ID is not configured.");
  }
  if (token.length === 0 || token.length > maximumTokenLength) {
    throw invalidToken();
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    throw invalidToken();
  }

  const [encodedHeader, encodedPayload, encodedSignature] = segments;
  if (
    encodedHeader === undefined ||
    encodedPayload === undefined ||
    encodedSignature === undefined
  ) {
    throw invalidToken();
  }

  const header = JwtHeaderSchema.safeParse(decodeJsonSegment(encodedHeader));
  const claims = FirebaseClaimsSchema.safeParse(decodeJsonSegment(encodedPayload));
  if (!header.success || !claims.success) {
    throw invalidToken();
  }
  validateClaims(claims.data, projectId, nowSeconds);

  if (isEmulatorMode(bindings)) {
    if (header.data.alg !== "none" || encodedSignature !== "") {
      throw invalidToken();
    }
    return toPrincipal(claims.data);
  }

  if (header.data.alg !== "RS256" || header.data.kid === undefined || encodedSignature === "") {
    throw invalidToken();
  }

  const verified = await crypto.subtle.verify(
    { name: "RSASSA-PKCS1-v1_5" },
    await signingKey(header.data.kid),
    decodeBase64Url(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!verified) {
    throw invalidToken();
  }
  return toPrincipal(claims.data);
}
