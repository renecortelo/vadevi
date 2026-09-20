import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

import { dailyBudgets, reserveBudget, type UsageMetric } from "../src/services/usage";

/**
 * The budgets in code and the CHECK constraint in the schema must name the same
 * metrics, and nothing enforced that. `websearch_calls` was added to
 * `dailyBudgets` on 2026-09-17 without a migration; every research run after it
 * reserved the new metric, tripped the constraint, and answered 500 — while
 * `research_lookups`, reserved a step earlier, counted a lookup that never ran.
 * The manual acceptance run found it. This would have, first.
 */
describe("usage budgets", () => {
  beforeAll(async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  it("can reserve every metric the code knows about against the migrated schema", async () => {
    const metrics = Object.keys(dailyBudgets) as UsageMetric[];
    expect(metrics.length).toBeGreaterThan(0);

    for (const metric of metrics) {
      // Any metric the schema's CHECK does not list throws here, which is the
      // whole point: the failure lands in this test rather than in a reader's
      // research screen.
      const reservation = await reserveBudget(env.DB, {
        metric,
        nowIso: "2099-01-01T00:00:00.000Z",
        spaceId: "usage-test-space",
        userId: `usage-test-user-${metric}`,
      });
      expect(reservation.allowed, metric).toBe(true);
      expect(reservation.userUsed, metric).toBe(1);
    }
  });

  it("refuses once the per-user cap is reached, without touching the global count", async () => {
    const metric: UsageMetric = "websearch_calls";
    const cap = dailyBudgets[metric].user;
    const userId = "usage-test-capped-user";
    for (let call = 0; call < cap; call += 1) {
      const reservation = await reserveBudget(env.DB, {
        metric,
        nowIso: "2098-06-01T00:00:00.000Z",
        spaceId: "usage-test-space",
        userId,
      });
      expect(reservation.allowed).toBe(true);
    }
    const over = await reserveBudget(env.DB, {
      metric,
      nowIso: "2098-06-01T00:00:00.000Z",
      spaceId: "usage-test-space",
      userId,
    });
    expect(over.allowed).toBe(false);
    expect(over.userUsed).toBe(cap);
  });

  it("hands the last unit to exactly one of many requests that arrive together", async () => {
    const metric: UsageMetric = "websearch_calls";
    const cap = dailyBudgets[metric].user;
    const userId = "usage-test-racing-user";
    const reserve = () =>
      reserveBudget(env.DB, {
        metric,
        nowIso: "2098-07-01T00:00:00.000Z",
        spaceId: "usage-test-space",
        userId,
      });
    // All but one unit taken, then ten requests at once for the last one.
    for (let call = 0; call < cap - 1; call += 1) expect((await reserve()).allowed).toBe(true);
    const outcomes = await Promise.all(Array.from({ length: 10 }, () => reserve()));
    expect(outcomes.filter((outcome) => outcome.allowed)).toHaveLength(1);
    const row = await env.DB.prepare(
      `SELECT used FROM usage_counters WHERE usage_date = '2098-07-01' AND scope = 'user' AND scope_id = ? AND metric = ?`,
    )
      .bind(userId, metric)
      .first<{ used: number }>();
    expect(row?.used).toBe(cap);
  });
});
