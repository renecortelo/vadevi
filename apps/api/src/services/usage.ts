import type { UsageReportResponse } from "@vadevi/contracts";

import type { WorkerBindings } from "../types";

/** Mirrors `UsageMetricSchema`; declared locally so budget lookups stay exhaustive. */
export type UsageMetric =
  "ai_language_calls" | "barcode_lookups" | "price_lookups" | "research_lookups";

/**
 * Application budgets sit below the documented provider free allocations in
 * §16.1, so the application stops before a provider does. Reaching a cap
 * degrades the feature; it never upgrades a plan, retries indefinitely, or
 * switches to a paid model.
 */
type Budget = { global: number; user: number };

export const dailyBudgets = {
  ai_language_calls: { global: 400, user: 60 },
  barcode_lookups: { global: 500, user: 60 },
  price_lookups: { global: 500, user: 60 },
  research_lookups: { global: 300, user: 40 },
} as const satisfies Record<UsageMetric, Budget>;

export const warningThreshold = 0.7;
export const criticalThreshold = 0.9;

export function usageDate(nowIso: string): string {
  return nowIso.slice(0, 10);
}

export function budgetStatus(
  used: number,
  limit: number,
): "capped" | "critical" | "ok" | "warning" {
  if (used >= limit) return "capped";
  if (used >= limit * criticalThreshold) return "critical";
  if (used >= limit * warningThreshold) return "warning";
  return "ok";
}

type Scope = { id: string; scope: "global" | "space" | "user" };

async function readUsed(
  database: D1Database,
  date: string,
  metric: UsageMetric,
  target: Scope,
): Promise<number> {
  const row = await database
    .prepare(
      `SELECT used FROM usage_counters
      WHERE usage_date = ? AND scope = ? AND scope_id = ? AND metric = ?`,
    )
    .bind(date, target.scope, target.id, metric)
    .first<{ used: number }>();
  return row?.used ?? 0;
}

/**
 * Reserve one unit of an optional-provider budget.
 *
 * Returns `false` when either the per-user or the global daily cap is already
 * reached, which callers must translate into a deterministic degraded result
 * rather than an error or a paid fallback.
 */
export async function reserveBudget(
  database: D1Database,
  options: { metric: UsageMetric; nowIso: string; spaceId: string; userId: string },
): Promise<{ allowed: boolean; globalUsed: number; userUsed: number }> {
  const date = usageDate(options.nowIso);
  const budget: Budget = dailyBudgets[options.metric];
  const [userUsed, globalUsed] = await Promise.all([
    readUsed(database, date, options.metric, { id: options.userId, scope: "user" }),
    readUsed(database, date, options.metric, { id: "global", scope: "global" }),
  ]);

  if (userUsed >= budget.user || globalUsed >= budget.global) {
    return { allowed: false, globalUsed, userUsed };
  }

  const increment = (scope: "global" | "space" | "user", scopeId: string) =>
    database
      .prepare(
        `INSERT INTO usage_counters (usage_date, scope, scope_id, metric, used, created_at, updated_at)
        VALUES (?, ?, ?, ?, 1, ?, ?)
        ON CONFLICT(usage_date, scope, scope_id, metric) DO UPDATE SET
          used = usage_counters.used + 1, updated_at = excluded.updated_at`,
      )
      .bind(date, scope, scopeId, options.metric, options.nowIso, options.nowIso);

  await database.batch([
    increment("user", options.userId),
    increment("space", options.spaceId),
    increment("global", "global"),
  ]);

  return { allowed: true, globalUsed: globalUsed + 1, userUsed: userUsed + 1 };
}

/**
 * Reserve one optional-provider unit for the authenticated member of a Space.
 *
 * A caller that receives `false` must fall back to the deterministic or manual
 * path. Failing to resolve the membership also returns `false`, so an
 * unauthorized request can never spend budget.
 */
export async function reserveProviderBudget(
  database: D1Database,
  options: { firebaseUid: string; metric: UsageMetric; nowIso: string; spaceId: string },
): Promise<boolean> {
  const actor = await database
    .prepare(
      `SELECT actor.id FROM users actor
      JOIN space_memberships membership ON membership.user_id = actor.id
      JOIN spaces space ON space.id = membership.space_id
      WHERE actor.firebase_uid = ? AND actor.deleted_at IS NULL
        AND membership.space_id = ? AND membership.status = 'active'
        AND space.deleted_at IS NULL`,
    )
    .bind(options.firebaseUid, options.spaceId)
    .first<{ id: string }>();
  if (actor === null) return false;

  const reservation = await reserveBudget(database, {
    metric: options.metric,
    nowIso: options.nowIso,
    spaceId: options.spaceId,
    userId: actor.id,
  });
  return reservation.allowed;
}

/**
 * The private usage report. It exposes aggregate counters and budget status
 * only: no account secret, wine name, note text, chat text, or provider payload.
 */
export async function buildUsageReport(
  database: D1Database,
  environment: WorkerBindings,
  options: { nowIso: string; spaceId: string; userId: string },
): Promise<UsageReportResponse> {
  const date = usageDate(options.nowIso);
  const metrics = Object.keys(dailyBudgets) as UsageMetric[];
  const counters: UsageReportResponse["data"]["counters"] = [];

  for (const metric of metrics) {
    const budget: Budget = dailyBudgets[metric];
    const [userUsed, globalUsed] = await Promise.all([
      readUsed(database, date, metric, { id: options.userId, scope: "user" }),
      readUsed(database, date, metric, { id: "global", scope: "global" }),
    ]);
    counters.push(
      {
        limit: budget.user,
        metric,
        scope: "user",
        status: budgetStatus(userUsed, budget.user),
        used: userUsed,
      },
      {
        limit: budget.global,
        metric,
        scope: "global",
        status: budgetStatus(globalUsed, budget.global),
        used: globalUsed,
      },
    );
  }

  return {
    data: {
      counters,
      providers: {
        aiProvider: environment.AI_PROVIDER ?? "none",
        researchProvider: environment.RESEARCH_PROVIDER ?? "none",
      },
      resetsAt: `${new Date(Date.parse(`${date}T00:00:00.000Z`) + 86_400_000)
        .toISOString()
        .slice(0, 10)}T00:00:00.000Z`,
      thresholds: { critical: criticalThreshold, warning: warningThreshold },
      usageDate: date,
    },
  };
}
