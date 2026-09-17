function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function sha256Base64Url(value: string | Uint8Array<ArrayBuffer>): Promise<string> {
  const source = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", source);
  return bytesToBase64Url(new Uint8Array(digest));
}

export function randomOpaqueToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function invitationTokenFromIdempotencyKey(
  idempotencyKey: string,
  spaceId: string,
  requestHash: string,
): Promise<string> {
  return sha256Base64Url(
    ["vadevi-invitation-token-v1", idempotencyKey, spaceId, requestHash].join("\0"),
  );
}
