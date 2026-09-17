export function createIdempotencyKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return encodeBase64Url(bytes);
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export async function idempotencyKeyForMutation(mutationId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(mutationId));
  return encodeBase64Url(new Uint8Array(digest));
}
