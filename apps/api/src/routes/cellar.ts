import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import {
  BottleIdPathSchema,
  BottleListQuerySchema,
  BottleListResponseSchema,
  BottleResponseSchema,
  CreateBottleRequestSchema,
  CreatePriceObservationRequestSchema,
  CreatePurchaseRequestSchema,
  CreateWishlistItemRequestSchema,
  ErrorEnvelopeSchema,
  IdempotencyKeySchema,
  PriceObservationListQuerySchema,
  PriceObservationListResponseSchema,
  PriceObservationResponseSchema,
  PurchaseResponseSchema,
  SpaceIdPathSchema,
  UpdateBottleRequestSchema,
  UpdateWishlistItemRequestSchema,
  WineFactsPathSchema,
  WishlistItemIdPathSchema,
  WishlistItemResponseSchema,
  WishlistListQuerySchema,
  WishlistListResponseSchema,
} from "@vadevi/contracts";

import {
  createBottle,
  createPriceObservation,
  createPurchase,
  createWishlistItem,
  listBottles,
  listPriceObservations,
  listWishlist,
  updateBottle,
  updateWishlistItem,
} from "../repositories/cellar";
import type { ApiEnvironment } from "../types";

const IdempotencyHeadersSchema = z.object({
  "Idempotency-Key": IdempotencyKeySchema.openapi({
    param: { in: "header", name: "Idempotency-Key" },
  }),
});

const commonErrors = {
  400: {
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
    description: "Invalid request.",
  },
  401: {
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
    description: "Authentication required.",
  },
  404: {
    content: { "application/json": { schema: ErrorEnvelopeSchema } },
    description: "The Space-scoped resource is unavailable.",
  },
};

const listBottlesRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/bottles",
  operationId: "listBottles",
  tags: ["Cellar"],
  summary: "List physical bottles with inventory derived from lifecycle rows",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema, query: BottleListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: BottleListResponseSchema } },
      description: "Authorized bottles and derived inventory counts.",
    },
    ...commonErrors,
  },
});

const createBottleRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/bottles",
  operationId: "createBottle",
  tags: ["Cellar"],
  summary: "Create one owned physical bottle",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateBottleRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: BottleResponseSchema } },
      description: "The new owned bottle.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The idempotency key or resource ID conflicts.",
    },
  },
});

const updateBottleRoute = createRoute({
  method: "patch",
  path: "/api/v1/spaces/{spaceId}/bottles/{bottleId}",
  operationId: "updateBottleLifecycle",
  tags: ["Cellar"],
  summary: "Advance a bottle through an explicit lifecycle transition",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: BottleIdPathSchema,
    body: {
      content: { "application/json": { schema: UpdateBottleRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: BottleResponseSchema } },
      description: "The updated bottle.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The bottle version changed or the lifecycle transition is invalid.",
    },
  },
});

const createPurchaseRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/purchases",
  operationId: "createPurchase",
  tags: ["Purchases"],
  summary: "Record a purchase, its sourced price, and optional physical bottles",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreatePurchaseRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: PurchaseResponseSchema } },
      description: "The purchase, derived bottles, and linked price observation.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The idempotency key or resource ID conflicts.",
    },
  },
});

const listWishlistRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/wishlist",
  operationId: "listWishlist",
  tags: ["Wishlist"],
  summary: "List the authorized Space wishlist",
  security: [{ FirebaseBearer: [] }],
  request: { params: SpaceIdPathSchema, query: WishlistListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: WishlistListResponseSchema } },
      description: "Space-scoped wishlist items.",
    },
    ...commonErrors,
  },
});

const createWishlistRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/wishlist",
  operationId: "createWishlistItem",
  tags: ["Wishlist"],
  summary: "Add one active wishlist item for a real wine",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: SpaceIdPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreateWishlistItemRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: WishlistItemResponseSchema } },
      description: "The active wishlist item.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "An active item or idempotency command conflicts.",
    },
  },
});

const updateWishlistRoute = createRoute({
  method: "patch",
  path: "/api/v1/spaces/{spaceId}/wishlist/{itemId}",
  operationId: "updateWishlistItem",
  tags: ["Wishlist"],
  summary: "Update or close one wishlist item with optimistic concurrency",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: WishlistItemIdPathSchema,
    body: {
      content: { "application/json": { schema: UpdateWishlistItemRequestSchema } },
      required: true,
    },
  },
  responses: {
    200: {
      content: { "application/json": { schema: WishlistItemResponseSchema } },
      description: "The updated wishlist item.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The wishlist version changed.",
    },
  },
});

const listPricesRoute = createRoute({
  method: "get",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/prices",
  operationId: "listPriceObservations",
  tags: ["Prices"],
  summary: "List timestamped sourced price observations with visible staleness",
  security: [{ FirebaseBearer: [] }],
  request: { params: WineFactsPathSchema, query: PriceObservationListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: PriceObservationListResponseSchema } },
      description: "Stored price observations and explicit external-coverage warnings.",
    },
    ...commonErrors,
  },
});

const createPriceRoute = createRoute({
  method: "post",
  path: "/api/v1/spaces/{spaceId}/wines/{wineId}/prices",
  operationId: "createPriceObservation",
  tags: ["Prices"],
  summary: "Record a timestamped manual or cited price observation",
  security: [{ FirebaseBearer: [] }],
  request: {
    params: WineFactsPathSchema,
    headers: IdempotencyHeadersSchema,
    body: {
      content: { "application/json": { schema: CreatePriceObservationRequestSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: PriceObservationResponseSchema } },
      description: "The timestamped sourced price observation.",
    },
    ...commonErrors,
    409: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The idempotency key or resource ID conflicts.",
    },
  },
});

function errorEnvelope(
  requestId: string,
  code: "IDEMPOTENCY_CONFLICT" | "NOT_FOUND" | "VERSION_CONFLICT",
  message: string,
  current?: unknown,
) {
  return ErrorEnvelopeSchema.parse({
    error: {
      code,
      ...(current === undefined ? {} : { details: { current } }),
      message,
      requestId,
    },
  });
}

export function registerCellarRoutes(app: OpenAPIHono<ApiEnvironment>) {
  app.openapi(listBottlesRoute, async (context) => {
    const params = context.req.valid("param");
    const query = context.req.valid("query");
    const response = await listBottles(context.env.DB!, {
      principal: context.get("principal"),
      spaceId: params.spaceId,
      ...(query.state === undefined ? {} : { state: query.state }),
      ...(query.wineId === undefined ? {} : { wineId: query.wineId }),
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(BottleListResponseSchema.parse(response), 200);
  });

  app.openapi(createBottleRoute, async (context) => {
    const result = await createBottle(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The command conflicts with an earlier request."
            : "The resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    context.header(
      "Location",
      `/api/v1/spaces/${context.req.valid("param").spaceId}/bottles/${result.response.data.id}`,
    );
    return context.json(BottleResponseSchema.parse(result.response), 201);
  });

  app.openapi(updateBottleRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await updateBottle(context.env.DB!, {
      bottleId: params.bottleId,
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
    });
    if (result.kind === "unavailable") {
      return context.json(
        errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
        404,
      );
    }
    if (result.kind !== "success") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          result.kind === "invalid_transition"
            ? "The bottle cannot move to that lifecycle state."
            : "The bottle changed before this update.",
          result.current.data,
        ),
        409,
      );
    }
    return context.json(BottleResponseSchema.parse(result.response), 200);
  });

  app.openapi(createPurchaseRoute, async (context) => {
    const result = await createPurchase(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The command conflicts with an earlier request."
            : "The resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(PurchaseResponseSchema.parse(result.response), 201);
  });

  app.openapi(listWishlistRoute, async (context) => {
    const params = context.req.valid("param");
    const query = context.req.valid("query");
    const response = await listWishlist(context.env.DB!, {
      principal: context.get("principal"),
      spaceId: params.spaceId,
      ...(query.state === undefined ? {} : { state: query.state }),
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(WishlistListResponseSchema.parse(response), 200);
  });

  app.openapi(createWishlistRoute, async (context) => {
    const result = await createWishlistItem(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: context.req.valid("param").spaceId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "An active wishlist item or command already exists."
            : "The resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(WishlistItemResponseSchema.parse(result.response), 201);
  });

  app.openapi(updateWishlistRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await updateWishlistItem(context.env.DB!, {
      itemId: params.itemId,
      principal: context.get("principal"),
      request: context.req.valid("json"),
      spaceId: params.spaceId,
    });
    if (result.kind === "unavailable") {
      return context.json(
        errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
        404,
      );
    }
    if (result.kind !== "success") {
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          "VERSION_CONFLICT",
          "The wishlist item changed before this update.",
          result.current.data,
        ),
        409,
      );
    }
    return context.json(WishlistItemResponseSchema.parse(result.response), 200);
  });

  app.openapi(listPricesRoute, async (context) => {
    const params = context.req.valid("param");
    const query = context.req.valid("query");
    const response = await listPriceObservations(context.env.DB!, {
      freshnessDays: query.freshnessDays,
      principal: context.get("principal"),
      spaceId: params.spaceId,
      wineId: params.wineId,
      ...(query.currency === undefined ? {} : { currency: query.currency }),
    });
    return response === null
      ? context.json(
          errorEnvelope(context.get("requestId"), "NOT_FOUND", "The resource was not found."),
          404,
        )
      : context.json(PriceObservationListResponseSchema.parse(response), 200);
  });

  app.openapi(createPriceRoute, async (context) => {
    const params = context.req.valid("param");
    const result = await createPriceObservation(context.env.DB!, {
      idempotencyKey: context.req.valid("header")["Idempotency-Key"],
      principal: context.get("principal"),
      request: context.req.valid("json"),
      requestId: context.get("requestId"),
      spaceId: params.spaceId,
      wineId: params.wineId,
    });
    if (result.kind !== "success") {
      const conflict = result.kind === "conflict";
      return context.json(
        errorEnvelope(
          context.get("requestId"),
          conflict ? "IDEMPOTENCY_CONFLICT" : "NOT_FOUND",
          conflict
            ? "The command conflicts with an earlier request."
            : "The resource was not found.",
        ),
        conflict ? 409 : 404,
      );
    }
    context.header("Idempotency-Replayed", String(result.replayed));
    return context.json(PriceObservationResponseSchema.parse(result.response), 201);
  });
}
