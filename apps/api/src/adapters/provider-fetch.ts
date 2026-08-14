import type { ExternalUnavailableReason } from "@vadevi/domain";

export type ProviderFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export class ProviderFetchError extends Error {
  constructor(readonly reason: ExternalUnavailableReason) {
    super(reason);
    this.name = "ProviderFetchError";
  }
}

function assertAllowedUrl(value: string | URL, allowedHosts: ReadonlySet<string>): URL {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username !== "" ||
    url.password !== "" ||
    !allowedHosts.has(url.hostname.toLowerCase())
  ) {
    throw new ProviderFetchError("unsafe_redirect");
  }
  return url;
}

export async function fetchFromProvider(
  fetcher: ProviderFetcher,
  initialUrl: string | URL,
  options: {
    allowedHosts: ReadonlySet<string>;
    headers: HeadersInit;
    maxRedirects?: number;
    timeoutMilliseconds?: number;
  },
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMilliseconds ?? 5_000);
  try {
    let url = assertAllowedUrl(initialUrl, options.allowedHosts);
    for (let redirect = 0; redirect <= (options.maxRedirects ?? 2); redirect += 1) {
      const response = await fetcher(url, {
        headers: options.headers,
        redirect: "manual",
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const location = response.headers.get("Location");
      if (location === null || redirect === (options.maxRedirects ?? 2)) {
        throw new ProviderFetchError("unsafe_redirect");
      }
      url = assertAllowedUrl(new URL(location, url), options.allowedHosts);
    }
    throw new ProviderFetchError("unsafe_redirect");
  } catch (error) {
    if (error instanceof ProviderFetchError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderFetchError("timeout");
    }
    throw new ProviderFetchError("provider_error");
  } finally {
    clearTimeout(timeout);
  }
}

export function retryAfterSeconds(response: Response): number | null {
  const value = response.headers.get("Retry-After");
  if (value === null) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.ceil(seconds);
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.max(0, Math.ceil((timestamp - Date.now()) / 1_000));
}

export async function readBoundedJson(
  response: Response,
  maximumBytes = 256 * 1_024,
): Promise<unknown> {
  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ProviderFetchError("provider_error");
  }
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new ProviderFetchError("provider_error");
  }
  if (response.body === null) throw new ProviderFetchError("provider_error");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maximumBytes) {
        await reader.cancel();
        throw new ProviderFetchError("provider_error");
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof ProviderFetchError) throw error;
    throw new ProviderFetchError("provider_error");
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes),
    ) as unknown;
  } catch {
    throw new ProviderFetchError("provider_error");
  }
}
