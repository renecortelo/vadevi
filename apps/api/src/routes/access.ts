import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  AddAllowedAccountRequestSchema,
  AllowedAccountPathSchema,
  AllowedAccountsResponseSchema,
  ErrorEnvelopeSchema,
} from "@vadevi/contracts";
import { ulid } from "ulid";

import { accessMode, adminEmails, isAdmin, normalizeEmail } from "../access/allowlist";
import type { ApiEnvironment } from "../types";

/**
 * The administrator's list of who may sign in.
 *
 * Only an administrator — an e-mail named in ADMIN_EMAILS, in the deployment's
 * own configuration — may read or change it; everyone else is answered 403,
 * including on an open deployment, where the list exists but gates nothing.
 * Administrators are not on the list and cannot be removed through it: the
 * door's keeper is set outside the door.
 */
const forbidden = {
  403: {
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
    description: "Only an administrator may keep the list.",
  },
};

const listRoute = createRoute({
  method: "get",
  path: "/api/v1/admin/allowed-accounts",
  operationId: "listAllowedAccounts",
  tags: ["Access"],
  summary: "The e-mails that may sign in, and whether each has",
  security: [{ FirebaseBearer: [] }],
  responses: {
    200: {
      content: { "application/json": { schema: AllowedAccountsResponseSchema } },
      description: "The list, the administrators, and the deployment's access mode.",
    },
    ...forbidden,
  },
});

const addRoute = createRoute({
  method: "post",
  path: "/api/v1/admin/allowed-accounts",
  operationId: "addAllowedAccount",
  tags: ["Access"],
  summary: "Let an e-mail sign in",
  security: [{ FirebaseBearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: AddAllowedAccountRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: AllowedAccountsResponseSchema } },
      description: "The list with the e-mail on it; adding one already there changes nothing.",
    },
    ...forbidden,
  },
});

const removeRoute = createRoute({
  method: "delete",
  path: "/api/v1/admin/allowed-accounts/{email}",
  operationId: "removeAllowedAccount",
  tags: ["Access"],
  summary: "Stop an e-mail from signing in",
  security: [{ FirebaseBearer: [] }],
  request: { params: AllowedAccountPathSchema },
  responses: {
    200: {
      content: { "application/json": { schema: AllowedAccountsResponseSchema } },
      description:
        "The list without the e-mail. An account that already exists keeps its data; its owner can no longer sign in.",
    },
    ...forbidden,
  },
});

type AccountRow = {
  added_at: string;
  email_normalized: string;
  note: string | null;
  user_id: string | null;
};

async function listAccounts(database: D1Database, environment: ApiEnvironment["Bindings"]) {
  const rows = await database
    .prepare(
      `SELECT account.email_normalized, account.note, account.created_at AS added_at,
        (SELECT u.id FROM users u
          WHERE u.email_normalized = account.email_normalized AND u.deleted_at IS NULL
          LIMIT 1) AS user_id
      FROM allowed_accounts account
      ORDER BY account.created_at DESC, account.email_normalized`,
    )
    .all<AccountRow>();
  return AllowedAccountsResponseSchema.parse({
    data: {
      accounts: rows.results.map((row) => ({
        addedAt: row.added_at,
        email: row.email_normalized,
        note: row.note,
        userId: row.user_id,
      })),
      admins: [...adminEmails(environment)].sort(),
      mode: accessMode(environment),
    },
  });
}

/**
 * That the list changed, by whom and when — never the e-mail, which the list
 * itself holds; the audit log stays free of personal data. An administrator
 * who has never signed in through the app has no user row to attribute the
 * change to, and the audit table requires one, so the trace is skipped rather
 * than the change refused.
 */
function auditTrace(
  database: D1Database,
  actorId: string | undefined,
  action: "access.allowed" | "access.revoked",
  requestId: string,
  now: string,
): D1PreparedStatement[] {
  if (actorId === undefined) return [];
  return [
    database
      .prepare(
        `INSERT INTO audit_events (
          id, actor_user_id, space_id, action, target_type, target_id,
          request_id, safe_metadata_json, created_at
        ) VALUES (?, ?, NULL, ?, 'allowed_account', ?, ?, NULL, ?)`,
      )
      .bind(ulid(), actorId, action, ulid(), requestId, now),
  ];
}

export function registerAccessRoutes(app: OpenAPIHono<ApiEnvironment>) {
  const refuse = (context: Parameters<Parameters<typeof app.openapi>[1]>[0]) =>
    context.json(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "FORBIDDEN",
          message: "Only an administrator may keep the list of who may sign in.",
          requestId: context.get("requestId"),
        },
      }),
      403,
    );

  app.openapi(listRoute, async (context) => {
    if (!isAdmin(context.env, context.get("principal"))) return refuse(context);
    return context.json(await listAccounts(context.env.DB!, context.env), 200);
  });

  app.openapi(addRoute, async (context) => {
    const principal = context.get("principal");
    if (!isAdmin(context.env, principal)) return refuse(context);
    const request = context.req.valid("json");
    const database = context.env.DB!;
    const actor = await database
      .prepare(`SELECT id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL`)
      .bind(principal.firebaseUid)
      .first<{ id: string }>();
    const now = new Date().toISOString();
    await database.batch([
      database
        .prepare(
          `INSERT INTO allowed_accounts (email_normalized, note, added_by_user_id, created_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(email_normalized) DO UPDATE SET note = COALESCE(excluded.note, note)`,
        )
        .bind(normalizeEmail(request.email), request.note ?? null, actor?.id ?? null, now),
      ...auditTrace(database, actor?.id, "access.allowed", context.get("requestId"), now),
    ]);
    return context.json(await listAccounts(database, context.env), 200);
  });

  app.openapi(removeRoute, async (context) => {
    const principal = context.get("principal");
    if (!isAdmin(context.env, principal)) return refuse(context);
    const email = normalizeEmail(context.req.valid("param").email);
    const database = context.env.DB!;
    const actor = await database
      .prepare(`SELECT id FROM users WHERE firebase_uid = ? AND deleted_at IS NULL`)
      .bind(principal.firebaseUid)
      .first<{ id: string }>();
    const now = new Date().toISOString();
    await database.batch([
      database.prepare(`DELETE FROM allowed_accounts WHERE email_normalized = ?`).bind(email),
      ...auditTrace(database, actor?.id, "access.revoked", context.get("requestId"), now),
    ]);
    return context.json(await listAccounts(database, context.env), 200);
  });
}
