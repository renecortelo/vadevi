import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { purgeExpiredDraftContentQuery } from "../src/repositories/action-drafts";
import { staleMediaQuery } from "../src/repositories/housekeeping";
import { unlinkedWinesQuery } from "../src/repositories/region-linking";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

/**
 * The scheduled run looks for a few rows in tables that only grow, and the
 * draft clean-up also runs before every read of a draft. Each search must read
 * the partial index that holds just those rows (migration 0054), not the
 * table: a plan that falls back to a scan still returns the right rows, so
 * nothing but the plan shows it.
 */
async function plan(sql: string, ...binds: unknown[]): Promise<string[]> {
  const rows = await env.DB.prepare(`EXPLAIN QUERY PLAN ${sql}`)
    .bind(...binds)
    .all<{ detail: string }>();
  return rows.results.map((row) => row.detail);
}

describe("what the scheduled run looks for", () => {
  it("finds expired photographs through their own index", async () => {
    const steps = await plan(staleMediaQuery, "2026-11-16T00:00:00.000Z", 100);
    expect(steps).toContainEqual(expect.stringContaining("idx_media_assets_pending_expiry"));
    expect(steps.filter((step) => /^SCAN media\b/.test(step))).toEqual([]);
  });

  it("clears expired action drafts through their own index", async () => {
    const now = "2026-11-16T00:00:00.000Z";
    const steps = await plan(purgeExpiredDraftContentQuery, now, now);
    expect(steps).toContainEqual(expect.stringContaining("idx_action_drafts_pending_content"));
    expect(steps.filter((step) => /^SCAN action_drafts\b/.test(step))).toEqual([]);
  });

  it("finds unlinked wines through their own index", async () => {
    const steps = await plan(unlinkedWinesQuery, "library-version", 200);
    expect(steps).toContainEqual(expect.stringContaining("idx_wine_records_unlinked_region"));
    expect(steps.filter((step) => /^SCAN wine_records$/.test(step))).toEqual([]);
  });
});
