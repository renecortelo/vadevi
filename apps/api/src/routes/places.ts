import { createRoute, type OpenAPIHono } from "@hono/zod-openapi";
import {
  ErrorEnvelopeSchema,
  PlaceCandidatesResponseSchema,
  PlaceReverseRequestSchema,
  PlaceSearchRequestSchema,
  SpaceIdPathSchema,
} from "@vadevi/contracts";
import type { ExternalResult, PlaceCandidate } from "@vadevi/domain";

import { createPlaceSearchPort } from "../adapters/research-factory";
import { reserveProviderBudget } from "../services/usage";
import type { ApiEnvironment } from "../types";

function errorEnvelope(requestId: string, code: "FEATURE_UNAVAILABLE", message: string) {
  return ErrorEnvelopeSchema.parse({ error: { code, message, requestId } });
}

const searchPlacesRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/places/search",
  operationId: "searchPlaces",
  tags: ["Places"],
  summary: "Find the place a tasting happened at, with its coordinates",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: {
      content: { "application/json": { schema: PlaceSearchRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: PlaceCandidatesResponseSchema } },
      description: "Matching places, each with a point. Empty when nothing matched.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication is required.",
    },
    503: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Venue lookup is not enabled for this deployment.",
    },
  },
});

const reversePlaceRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/places/reverse",
  operationId: "reversePlace",
  tags: ["Places"],
  summary: "Name the place at a point, for a reader who is there",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    body: {
      content: { "application/json": { schema: PlaceReverseRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: PlaceCandidatesResponseSchema } },
      description: "The place at that point, or nothing when it is unnamed.",
    },
    401: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Authentication is required.",
    },
    503: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "Venue lookup is not enabled for this deployment.",
    },
  },
});

// The Space is in the path so the lookup is charged to the same daily budget as
// every other provider call, and so an unauthenticated caller never reaches the
// provider at all.
export function registerPlaceRoutes(app: OpenAPIHono<ApiEnvironment>) {
  /** The provider's answer as this route reports it: a hit list, or a plain 200
   *  with nothing in it. A geocoder that is down should not fail the tasting
   *  form the reader is in the middle of filling in. */
  function respond(
    context: Parameters<Parameters<typeof app.openapi>[1]>[0],
    result: ExternalResult<PlaceCandidate[]>,
  ) {
    const places = result.status === "success" ? result.data : [];
    return context.json(PlaceCandidatesResponseSchema.parse({ data: { places } }), 200);
  }

  app.openapi(searchPlacesRoute, async (context) => {
    const port = createPlaceSearchPort(context.env.DB!, context.env);
    if (port === null) {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "FEATURE_UNAVAILABLE",
          "Venue lookup is not enabled for this deployment.",
        ),
        503,
      );
    }
    const body = context.req.valid("json");
    // A place lookup is an open-data lookup like any other, so it is metered
    // against the same daily research budget rather than getting its own.
    const withinBudget = await reserveProviderBudget(context.env.DB!, {
      firebaseUid: context.get("principal").firebaseUid,
      metric: "research_lookups",
      nowIso: new Date().toISOString(),
      spaceId: context.req.valid("param").spaceId,
    });
    if (!withinBudget) {
      return respond(context, {
        reason: "rate_limited",
        retryAfterSeconds: null,
        status: "unavailable",
      });
    }
    return respond(
      context,
      await port.search({
        locale: body.locale,
        ...(body.near === undefined ? {} : { near: body.near }),
        query: body.query,
      }),
    );
  });

  app.openapi(reversePlaceRoute, async (context) => {
    const port = createPlaceSearchPort(context.env.DB!, context.env);
    if (port === null) {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "FEATURE_UNAVAILABLE",
          "Venue lookup is not enabled for this deployment.",
        ),
        503,
      );
    }
    const body = context.req.valid("json");
    const withinBudget = await reserveProviderBudget(context.env.DB!, {
      firebaseUid: context.get("principal").firebaseUid,
      metric: "research_lookups",
      nowIso: new Date().toISOString(),
      spaceId: context.req.valid("param").spaceId,
    });
    if (!withinBudget) {
      return respond(context, {
        reason: "rate_limited",
        retryAfterSeconds: null,
        status: "unavailable",
      });
    }
    return respond(
      context,
      await port.reverse({
        latitude: body.latitude,
        locale: body.locale,
        longitude: body.longitude,
      }),
    );
  });
}
