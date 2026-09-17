import type { MiddlewareHandler } from "hono";

import type { ApiEnvironment } from "../types";

const securityHeaders = {
  "Content-Security-Policy":
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  // `same-origin` severs window.opener, which is the channel a sign-in popup
  // uses to hand its result back. `allow-popups` keeps the isolation that
  // matters while letting that one channel work.
  "Cross-Origin-Opener-Policy": "same-origin-allow-popups",
  "Permissions-Policy": "camera=(self), microphone=(self), geolocation=(self)",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * The proxied Firebase sign-in handler is a third-party document that ships its
 * own headers and needs to load Google's scripts. Applying this application's
 * `default-src 'none'` policy to it would break the very handshake the proxy
 * exists to enable, so the reserved prefix keeps upstream's headers.
 */
function ownsResponseHeaders(pathname: string): boolean {
  return !pathname.startsWith("/__/auth/");
}

export const security: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  await next();
  if (!ownsResponseHeaders(new URL(context.req.url).pathname)) return;
  for (const [name, value] of Object.entries(securityHeaders)) {
    context.header(name, value);
  }
};
