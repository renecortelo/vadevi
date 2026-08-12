import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import {
  BootstrapResponseSchema,
  ErrorEnvelopeSchema,
  HealthResponseSchema,
} from "@vadevi/contracts";

import { authentication } from "./middleware/authentication";
import { requestContext } from "./middleware/request-context";
import { security } from "./middleware/security";
import { bootstrapUser } from "./repositories/bootstrap";
import type { ApiEnvironment } from "./types";

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  operationId: "getHealth",
  tags: ["Runtime"],
  summary: "Check the API process without authentication",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
      description: "The API process is available.",
      headers: {
        "X-Request-Id": {
          description: "Opaque request correlation identifier.",
          schema: { type: "string" },
        },
      },
    },
  },
});

const bootstrapRoute = createRoute({
  method: "get",
  path: "/api/v1/me/bootstrap",
  operationId: "getBootstrap",
  tags: ["Session"],
  summary: "Create or load the authenticated user's private bootstrap state",
  security: [{ FirebaseBearer: [] }],
  responses: {
    200: {
      content: {
        "application/json": {
          schema: BootstrapResponseSchema,
        },
      },
      description: "The authenticated user, active memberships, and runtime feature state.",
    },
    401: {
      content: {
        "application/json": {
          schema: ErrorEnvelopeSchema,
        },
      },
      description: "A valid Firebase ID token is required.",
    },
  },
});

function healthPayload(version: string | undefined) {
  return {
    data: {
      status: "ok" as const,
      service: "vadevi-api" as const,
      version: version ?? "0.1.0",
      timestamp: new Date().toISOString(),
    },
  };
}

export function createApi() {
  const app = new OpenAPIHono<ApiEnvironment>();

  app.openAPIRegistry.registerComponent("securitySchemes", "FirebaseBearer", {
    bearerFormat: "Firebase ID token",
    scheme: "bearer",
    type: "http",
  });

  app.use("*", requestContext);
  app.use("*", security);
  app.use("/api/v1/me/*", authentication);

  app.openapi(healthRoute, (context) => context.json(healthPayload(context.env?.APP_VERSION), 200));

  // The versioned alias keeps ordinary clients under /api/v1 while /health remains a minimal
  // provider-friendly liveness endpoint and the canonical OpenAPI operation.
  app.get("/api/v1/health", (context) =>
    context.json(healthPayload(context.env?.APP_VERSION), 200),
  );

  app.openapi(bootstrapRoute, async (context) => {
    const database = context.env.DB;
    if (database === undefined) {
      throw new Error("The D1 binding is unavailable.");
    }

    const response = await bootstrapUser(database, {
      aiProvider: context.env.AI_PROVIDER ?? "none",
      principal: context.get("principal"),
      requestId: context.get("requestId"),
    });
    return context.json(BootstrapResponseSchema.parse(response), 200);
  });

  app.get("/openapi.json", (context) =>
    context.json(
      app.getOpenAPIDocument({
        openapi: "3.1.0",
        info: {
          title: "Va de Vi API",
          version: "0.1.0",
        },
      }),
    ),
  );

  app.notFound((context) =>
    context.json(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "NOT_FOUND",
          message: "The requested resource was not found.",
          requestId: context.get("requestId"),
        },
      }),
      404,
    ),
  );

  app.onError((error, context) => {
    console.error(
      JSON.stringify({
        level: "error",
        requestId: context.get("requestId"),
        errorName: error.name,
      }),
    );

    return context.json(
      ErrorEnvelopeSchema.parse({
        error: {
          code: "INTERNAL_ERROR",
          message: "Something went wrong while handling this request.",
          requestId: context.get("requestId"),
        },
      }),
      500,
    );
  });

  return app;
}
