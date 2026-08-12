import { ErrorEnvelopeSchema } from "@vadevi/contracts";
import type { MiddlewareHandler } from "hono";

import { FirebaseTokenVerificationError, verifyFirebaseIdToken } from "../auth/firebase-token";
import type { ApiEnvironment } from "../types";

type ApiContext = Parameters<MiddlewareHandler<ApiEnvironment>>[0];

function unauthorized(context: ApiContext, code: "AUTH_REQUIRED" | "AUTH_INVALID") {
  return context.json(
    ErrorEnvelopeSchema.parse({
      error: {
        code,
        message:
          code === "AUTH_REQUIRED"
            ? "Authentication is required for this request."
            : "The authentication token is invalid or expired.",
        requestId: context.get("requestId"),
      },
    }),
    401,
  );
}

export const authentication: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  const authorization = context.req.header("Authorization");
  if (authorization === undefined) {
    return unauthorized(context, "AUTH_REQUIRED");
  }

  const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization);
  if (match?.[1] === undefined) {
    return unauthorized(context, "AUTH_INVALID");
  }

  try {
    context.set("principal", await verifyFirebaseIdToken(match[1], context.env));
  } catch (error) {
    if (error instanceof FirebaseTokenVerificationError) {
      return unauthorized(context, "AUTH_INVALID");
    }
    throw error;
  }

  await next();
};
