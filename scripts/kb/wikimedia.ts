/**
 * A polite Wikimedia client for the library builds: one request a second,
 * and on 429 or 5xx it waits as long as the server asks (Retry-After), or
 * longer each time, before trying again. The builds are run by hand and
 * rarely; there is no hurry worth being throttled for.
 */
export const userAgent =
  "VaDeVi-kb-builder/0.1 (https://github.com/renecortelo/vadevi; library build, run by hand)";

let last = 0;

export async function wikimedia<T>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const wait = Math.max(0, last + 1_000 - Date.now());
    await new Promise((settle) => setTimeout(settle, wait));
    last = Date.now();
    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": userAgent },
    });
    if (response.ok) return (await response.json()) as T;
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 0;
    await new Promise((settle) => setTimeout(settle, Math.max(backoff, 15_000 * (attempt + 1))));
  }
  throw new Error(`Failed after retries: ${url}`);
}

/** The same, for a file (an image), returned as bytes. */
export async function wikimediaFile(url: string): Promise<Uint8Array> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const wait = Math.max(0, last + 1_000 - Date.now());
    await new Promise((settle) => setTimeout(settle, wait));
    last = Date.now();
    const response = await fetch(url, { headers: { "User-Agent": userAgent } });
    if (response.ok) return new Uint8Array(await response.arrayBuffer());
    const retryAfter = Number(response.headers.get("retry-after"));
    const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1_000 : 0;
    await new Promise((settle) => setTimeout(settle, Math.max(backoff, 15_000 * (attempt + 1))));
  }
  throw new Error(`Failed after retries: ${url}`);
}
