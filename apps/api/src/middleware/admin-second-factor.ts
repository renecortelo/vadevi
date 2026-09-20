import { ErrorEnvelopeSchema } from "@vadevi/contracts";
import type { MiddlewareHandler } from "hono";

import { normalizeEmail } from "../access/allowlist";
import {
  AccessVerificationError,
  accessJwtHeader,
  accessSetup,
  verifyAccessJwt,
} from "../access/cloudflare-access";
import type { ApiEnvironment } from "../types";

/**
 * The administrator's routes, behind a second door when one is configured.
 *
 * Runs after authentication and the allowlist. With Cloudflare Access set up
 * for this deployment, every request here must carry Access's JWT — put there
 * by Cloudflare's edge once the person passed the Access policy — and the
 * e-mail it vouches for must be the e-mail of the Firebase identity making
 * the request. A missing or foreign JWT is answered with a code the page can
 * act on: it sends the browser through the Access login and back.
 */
export const adminSecondFactor: MiddlewareHandler<ApiEnvironment> = async (context, next) => {
  const setup = accessSetup(context.env);
  if (setup.kind === "off") {
    await next();
    return;
  }
  if (setup.kind === "invalid") {
    // Half a door, or a malformed one: the operator meant to have a second
    // factor here. Until the settings are whole, nobody passes.
    return context.json(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "MISCONFIGURED",
          message: `The administrator's second factor is misconfigured: ${setup.reason}.`,
          requestId: context.get("requestId"),
        },
      }),
      503,
    );
  }
  const { configuration } = setup;
  const refuse = () =>
    context.json(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "SECOND_FACTOR_REQUIRED",
          message: "The administrator's routes need Cloudflare Access for the same account.",
          requestId: context.get("requestId"),
        },
      }),
      403,
    );
  const token = context.req.header(accessJwtHeader);
  if (token === undefined || token.length === 0 || token.length > 8_192) return refuse();
  let verifiedEmail: string;
  try {
    verifiedEmail = await verifyAccessJwt(token, configuration);
  } catch (error) {
    if (error instanceof AccessVerificationError) return refuse();
    throw error;
  }
  const principalEmail = context.get("principal").email;
  if (principalEmail === undefined || normalizeEmail(principalEmail) !== verifiedEmail) {
    return refuse();
  }
  await next();
};
