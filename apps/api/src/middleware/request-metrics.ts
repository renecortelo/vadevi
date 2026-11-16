import type { MiddlewareHandler } from "hono";
import { routePath } from "hono/route";

import type { ApiEnvironment } from "../types";

/**
 * What one request cost the database, summed over every statement it ran.
 *
 * D1 reports, for each statement, the rows it read and wrote and how long it
 * took inside the database; this is the sum. `rowsRead` is what D1 bills and
 * what an index saves; `ms` is time inside D1, the rest of the request's time
 * being the Worker and the network between them.
 */
export type DatabaseUsage = {
  ms: number;
  queries: number;
  rowsRead: number;
  rowsWritten: number;
};

type Tally = (meta: D1Meta | undefined) => void;

function tallyInto(usage: DatabaseUsage): Tally {
  return (meta) => {
    usage.queries += 1;
    usage.rowsRead += meta?.rows_read ?? 0;
    usage.rowsWritten += meta?.rows_written ?? 0;
    usage.ms += meta?.duration ?? 0;
  };
}

/** The statement a metered one stands for, so `batch` can hand D1 its own. */
const originals = new WeakMap<object, D1PreparedStatement>();

function meteredStatement(statement: D1PreparedStatement, tally: Tally): D1PreparedStatement {
  const metered = {
    bind: (...values: unknown[]) => meteredStatement(statement.bind(...values), tally),
    all: async <T>() => {
      const result = await statement.all<T>();
      tally(result.meta);
      return result;
    },
    run: async <T>() => {
      const result = await statement.run<T>();
      tally(result.meta);
      return result;
    },
    // `first` hides the statement's figures, so it runs as `all` and returns
    // what `first` would: D1 does not add a LIMIT either, so the rows read are
    // the same. Same contract, missing column included.
    first: async <T>(column?: string) => {
      const result = await statement.all<Record<string, unknown>>();
      tally(result.meta);
      const row = result.results[0];
      if (column === undefined) return (row ?? null) as T | null;
      if (row !== undefined && !(column in row)) {
        throw new Error(`D1_COLUMN_NOTFOUND: Column not found (${column})`);
      }
      return (row?.[column] ?? null) as T | null;
    },
    // Rows without names come back without figures; nothing here uses it, but
    // a statement run this way still counts.
    raw: (async (options?: { columnNames?: boolean }) => {
      tally(undefined);
      return options?.columnNames === true ? statement.raw({ columnNames: true }) : statement.raw();
    }) as D1PreparedStatement["raw"],
  } as D1PreparedStatement;
  originals.set(metered, statement);
  return metered;
}

/**
 * The database as a request sees it: the same database, each statement's
 * figures added to `usage` as it runs. Batches count each statement.
 */
export function meteredDatabase(database: D1Database, usage: DatabaseUsage): D1Database {
  const tally = tallyInto(usage);
  return {
    prepare: (query: string) => meteredStatement(database.prepare(query), tally),
    batch: async <T>(statements: D1PreparedStatement[]) => {
      const results = await database.batch<T>(
        statements.map((statement) => originals.get(statement) ?? statement),
      );
      for (const result of results) tally(result.meta);
      return results;
    },
    exec: async (query: string) => {
      const result = await database.exec(query);
      usage.queries += result.count;
      usage.ms += result.duration;
      return result;
    },
    withSession: (constraint?: string) => database.withSession(constraint),
    dump: () => database.dump(),
  } as D1Database;
}

/**
 * One line per API request: its route, status, time and what it cost D1.
 *
 * The route is the pattern it matched (`/api/v1/spaces/:spaceId/wines`),
 * never the URL, so no id or invitation token is written down, and lines group
 * by route without help. Workers Logs keeps them, queryable by any field; it
 * is what Q-04 asked for — which routes cost most, measured in production
 * instead of estimated from plans.
 *
 * The time is the Worker's clock across the request; it moves on I/O, which is
 * what a request mostly waits on. Work handed to `waitUntil` finishes after the
 * line is written and is not counted.
 */
export const requestMetrics: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  const started = Date.now();
  const usage: DatabaseUsage = { ms: 0, queries: 0, rowsRead: 0, rowsWritten: 0 };
  const database = context.env?.DB;
  if (database !== undefined) {
    context.env = { ...context.env, DB: meteredDatabase(database, usage) };
  }
  await next();
  console.log(
    JSON.stringify({
      level: "info",
      message: "request",
      requestId: context.get("requestId"),
      method: context.req.method,
      route: context.get("unmatchedRoute") === true ? "(none)" : routePath(context, -1),
      status: context.res.status,
      ms: Date.now() - started,
      d1: { ...usage, ms: Math.round(usage.ms * 1000) / 1000 },
    }),
  );
};
