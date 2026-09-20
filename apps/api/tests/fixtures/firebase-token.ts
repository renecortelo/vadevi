type TokenClaims = {
  aud: string;
  auth_time: number;
  email: string;
  /** Google always vouches for the address; a test unsets this to play a
   *  provider that does not. */
  email_verified: boolean;
  exp: number;
  iat: number;
  iss: string;
  name: string;
  sub: string;
};

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function emulatorIdToken(
  overrides: Partial<TokenClaims> = {},
  nowSeconds = Math.floor(Date.now() / 1_000),
): string {
  const claims: TokenClaims = {
    aud: "demo-vadevi",
    auth_time: nowSeconds - 5,
    email: "phase1@example.test",
    email_verified: true,
    exp: nowSeconds + 3_600,
    iat: nowSeconds - 5,
    iss: "https://securetoken.google.com/demo-vadevi",
    name: "Phase One",
    sub: "firebase-emulator-user-phase-1",
    ...overrides,
  };

  return `${base64Url({ alg: "none", typ: "JWT" })}.${base64Url(claims)}.`;
}
