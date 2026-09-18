import type { UsageReportResponse } from "@vadevi/contracts";

import type { WorkerBindings } from "../types";

/** Mirrors `UsageMetricSchema`; declared locally so budget lookups stay exhaustive. */
export type UsageMetric =
  | "ai_language_calls"
  | "barcode_lookups"
  | "ocr_reads"
  | "price_lookups"
  | "research_lookups"
  | "websearch_calls";

/**
 * Application budgets sized to the providers' free allowances, so the
 * application stops before a bill starts. Reaching a cap degrades the feature;
 * it never upgrades a plan, retries indefinitely, or switches to a paid model.
 *
 * This comment used to claim these sat below the free allowances. A recheck
 * against the providers' live pricing on 2026-09-17 found they did not, which is
 * why the numbers below are not the ones this file shipped with.
 *
 * **Workers AI is one shared pool of 10,000 Neurons a day**, drawn on by both
 * `ai_language_calls` and `ocr_reads`, and Neurons are priced per model. These
 * two are therefore sized together, against the deployment's configured models,
 * because a long conversation costs more Neurons than a short one and this
 * counts calls, not Neurons. Take the model id from `wrangler ai models` and not
 * from the pricing page: they do not list the same set, and a model that does
 * not exist in the account fails every call rather than failing to deploy.
 *
 * - `ai_language_calls` at 120/day: ~27 Neurons a reply on
 *   `@cf/meta/llama-3.1-8b-instruct-fp8` → ~3,300.
 * - `ocr_reads` at 80/day: ~45 Neurons a read on the 11b vision model → ~3,600.
 *
 * That is ~5,000 of 10,000, leaving room for the estimate to be wrong. A
 * deployment on a larger text model must lower `ai_language_calls` to match: the
 * 70b model costs about six times as much per reply, and 120 of those would
 * overrun the day's allowance on their own.
 *
 * **`websearch_calls` is separate from `research_lookups` on purpose.** Brave is
 * the only provider in the research flow that bills — $5 of monthly credit
 * against $5 per 1,000 requests, so about 1,000 a month — while Wikidata, Open
 * Food Facts and Nominatim are free. A shared cap tight enough for Brave would
 * throttle venue lookups, which are the most frequent thing a reader does. A
 * daily cap bounds the month: 25 a day cannot exceed 775 in the longest one.
 *
 * `price_lookups` has no consumer. Price lookup is unbuilt — `priceLookup` is
 * hardcoded false in the bootstrap — but the metric is part of the published
 * usage contract and its label is translated in every catalogue, so it stays
 * rather than churning contracts and eight locales for a dead number.
 */
type Budget = { global: number; user: number };

export const dailyBudgets = {
  ai_language_calls: { global: 120, user: 30 },
  barcode_lookups: { global: 500, user: 60 },
  ocr_reads: { global: 80, user: 20 },
  price_lookups: { global: 500, user: 60 },
  research_lookups: { global: 300, user: 40 },
  websearch_calls: { global: 25, user: 10 },
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
