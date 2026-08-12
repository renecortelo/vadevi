import { z } from "zod";

const EmulatorResponseSchema = z.object({
  idToken: z.string().min(1),
  localId: z.string().min(1),
});

const TokenHeaderSchema = z.object({
  alg: z.literal("none"),
});

const TokenClaimsSchema = z.object({
  aud: z.literal("demo-vadevi"),
  iss: z.literal("https://securetoken.google.com/demo-vadevi"),
  sub: z.string().min(1),
});

function decodeBase64Url(segment: string): unknown {
  const normalized = segment.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

const host = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099";
const response = await fetch(
  `http://${host}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `phase1-${crypto.randomUUID()}@example.test`,
      password: crypto.randomUUID(),
      returnSecureToken: true,
    }),
  },
);

if (!response.ok) {
  throw new Error(`Firebase Auth Emulator sign-up failed with HTTP ${response.status}.`);
}

const result = EmulatorResponseSchema.parse(await response.json());
const [headerSegment, payloadSegment, signatureSegment] = result.idToken.split(".");
if (headerSegment === undefined || payloadSegment === undefined || signatureSegment === undefined) {
  throw new Error("Firebase Auth Emulator returned a malformed ID token.");
}

TokenHeaderSchema.parse(decodeBase64Url(headerSegment));
const claims = TokenClaimsSchema.parse(decodeBase64Url(payloadSegment));
if (signatureSegment !== "" || claims.sub !== result.localId) {
  throw new Error("Firebase Auth Emulator returned unexpected token identity or signature data.");
}

console.info("Firebase Auth Emulator issued a valid local-only demo project ID token.");
