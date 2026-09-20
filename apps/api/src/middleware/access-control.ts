import { ErrorEnvelopeSchema } from "@vadevi/contracts";
import type { MiddlewareHandler } from "hono";

import { accessMode, isAllowed } from "../access/allowlist";
import type { ApiEnvironment } from "../types";

/**
 * The door, after the identity check.
 *
 * Runs on every route that authentication runs on, once the principal is
 * known. On an open deployment it costs nothing; on a private one it is one
 * indexed lookup, and a principal who is not on the list is answered 403 with
 * a code the client can name — "this instance is private" — rather than the
 * 401 that means "sign in again". Nothing is created for a refused principal:
 * the bootstrap that would have made their account never runs.
 */
export const accessControl: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  const database = context.env.DB;
  if (database === undefined) {
    throw new Error("The D1 binding is unavailable.");
  }
  if (accessMode(context.env) === "invalid") {
    // A door the operator meant to close and misspelled. Nobody comes in — not
    // even an administrator — and the answer names the setting, not privacy.
    return context.json(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "MISCONFIGURED",
          message: "ACCESS_MODE is not one of open or allowlist. Fix the deployment's settings.",
          requestId: context.get("requestId"),
        },
      }),
      503,
    );
  }
  if (!(await isAllowed(database, context.env, context.get("principal")))) {
    return context.json(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "ACCESS_DENIED",
          message: "This deployment is private. Ask its administrator for access.",
          requestId: context.get("requestId"),
        },
      }),
      403,
    );
  }
  await next();
};
