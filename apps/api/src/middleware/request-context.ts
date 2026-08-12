import type { MiddlewareHandler } from "hono";
import { ulid } from "ulid";

import type { ApiEnvironment } from "../types";

const validRequestId = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const requestContext: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  const supplied = context.req.header("X-Request-Id")?.toUpperCase();
  const requestId = supplied !== undefined && validRequestId.test(supplied) ? supplied : ulid();
  context.set("requestId", requestId);
  await next();
  context.header("X-Request-Id", requestId);
};
