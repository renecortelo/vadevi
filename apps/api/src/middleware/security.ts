import type { MiddlewareHandler } from "hono";

import type { ApiEnvironment } from "../types";

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

export const security: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  await next();
  for (const [name, value] of Object.entries(securityHeaders)) {
    context.header(name, value);
  }
};
