import type { ExternalCachePort, ExternalRateLimitPort } from "@vadevi/domain";

export class D1ExternalCache implements ExternalCachePort {
  constructor(private readonly database: D1Database) {}

  async get<T>(provider: string, key: string, now: string): Promise<T | null> {
    const row = await this.database
      .prepare(
        `SELECT response_json FROM external_adapter_cache
        WHERE provider = ? AND cache_key = ? AND expires_at > ?`,
      )
      .bind(provider, key, now)
      .first<{ response_json: string }>();
    if (row === null) return null;
    try {
      return JSON.parse(row.response_json) as T;
    } catch {
      return null;
    }
  }

  async put<T>(
    provider: string,
    key: string,
    value: T,
    expiresAt: string,
    now: string,
  ): Promise<void> {
    await this.database
      .prepare(
        `INSERT INTO external_adapter_cache (
          provider, cache_key, response_json, expires_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, cache_key) DO UPDATE SET
          response_json = excluded.response_json,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at`,
      )
      .bind(provider, key, JSON.stringify(value), expiresAt, now, now)
      .run();
  }
}

export class D1ExternalRateLimiter implements ExternalRateLimitPort {
  constructor(private readonly database: D1Database) {}

  async consume(
    provider: string,
    limit: number,
    windowSeconds: number,
    now: string,
  ): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
    const nowMilliseconds = Date.parse(now);
    const windowMilliseconds = windowSeconds * 1_000;
    const windowStartedMilliseconds =
      Math.floor(nowMilliseconds / windowMilliseconds) * windowMilliseconds;
    const windowStartedAt = new Date(windowStartedMilliseconds).toISOString();
    const result = await this.database
      .prepare(
        `INSERT INTO external_rate_windows (
          provider, window_started_at, request_count, updated_at
        ) VALUES (?, ?, 1, ?)
        ON CONFLICT(provider, window_started_at) DO UPDATE SET
          request_count = external_rate_windows.request_count + 1,
          updated_at = excluded.updated_at
        WHERE external_rate_windows.request_count < ?`,
      )
      .bind(provider, windowStartedAt, now, limit)
      .run();
    return {
      allowed: result.meta.changes === 1,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((windowStartedMilliseconds + windowMilliseconds - nowMilliseconds) / 1_000),
      ),
    };
  }
}
