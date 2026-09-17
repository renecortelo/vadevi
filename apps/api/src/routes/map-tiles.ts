import { createRoute, type OpenAPIHono, z } from "@hono/zod-openapi";
import { ErrorEnvelopeSchema } from "@vadevi/contracts";

import { fetchFromProvider, type ProviderFetcher } from "../adapters/provider-fetch";
import { mapTilesEnabled } from "../adapters/research-factory";
import type { ApiEnvironment } from "../types";

const tileHost = "tile.openstreetmap.org";

/** A tile coordinate, in range for its zoom. Anything else is not a tile. */
export function validTile(z: number, x: number, y: number): boolean {
  if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y)) return false;
  if (z < 0 || z > 19) return false;
  const max = 2 ** z;
  return x >= 0 && x < max && y >= 0 && y < max;
}

const tileParams = z
  .object({
    x: z.coerce.number().int(),
    y: z.coerce.number().int(),
    z: z.coerce.number().int(),
  })
  .strict();

const mapTileRoute = createRoute({
  method: "get",
  path: "/api/v1/map-tiles/{z}/{x}/{y}",
  operationId: "getMapTile",
  tags: ["Map"],
  summary: "A map background tile, proxied from OpenStreetMap and cached",
  request: { params: tileParams },
  responses: {
    200: { description: "A PNG map tile." },
    400: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The tile coordinate is out of range.",
    },
    404: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "The tile could not be fetched.",
    },
    503: {
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
      description: "A map background is not enabled for this deployment.",
    },
  },
});

/**
 * Serve map tiles from our own origin.
 *
 * The browser asks this Worker for `/api/v1/map-tiles/z/x/y`, and the Worker
 * fetches the tile from OpenStreetMap and hands it back — so the map draws
 * under a `default-src 'self'` policy that would block a tile host outright, the
 * same way bottle photos are proxied. Tiles are cached at the edge and in the
 * response, because a tile does not change and OSM's tile policy asks that its
 * donated servers not be hammered; the identifying user agent it also asks for
 * is sent on every upstream fetch.
 *
 * Public, like the map background it draws: a tile carries no wine, no note, no
 * account — only the geography everyone shares. It is gated by the deployment's
 * own switch, not by the reader's session.
 */
export function registerMapTileRoutes(
  app: OpenAPIHono<ApiEnvironment>,
  fetcher: ProviderFetcher = fetch,
) {
  app.openapi(mapTileRoute, async (context) => {
    if (!mapTilesEnabled(context.env)) {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "FEATURE_UNAVAILABLE",
            message: "A map background is not enabled for this deployment.",
            requestId: context.get("requestId"),
          },
        }),
        503,
      );
    }
    const { x, y, z } = context.req.valid("param");
    if (!validTile(z, x, y)) {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "VALIDATION_FAILED",
            message: "The tile coordinate is out of range.",
            requestId: context.get("requestId"),
          },
        }),
        400,
      );
    }

    // The edge cache first: a tile fetched once is served from the cache after,
    // so a map that is panned back over the same ground makes no upstream call.
    const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
    const cacheKey = new Request(new URL(context.req.url).toString());
    if (cache !== undefined) {
      const hit = await cache.match(cacheKey);
      if (hit !== undefined) return hit;
    }

    let upstream: Response;
    try {
      upstream = await fetchFromProvider(fetcher, `https://${tileHost}/${z}/${x}/${y}.png`, {
        allowedHosts: new Set([tileHost]),
        headers: {
          Accept: "image/png",
          // OSM's tile usage policy requires an identifying agent with a contact.
          "User-Agent": context.env.EXTERNAL_API_USER_AGENT!,
        },
      });
    } catch {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "NOT_FOUND",
            message: "The tile could not be fetched.",
            requestId: context.get("requestId"),
          },
        }),
        404,
      );
    }
    if (!upstream.ok) {
      return context.json(
        ErrorEnvelopeSchema.parse({
          error: {
            code: "NOT_FOUND",
            message: "The tile could not be fetched.",
            requestId: context.get("requestId"),
          },
        }),
        404,
      );
    }

    const bytes = await upstream.arrayBuffer();
    const response = new Response(bytes, {
      headers: {
        "Cache-Control": "public, max-age=604800, immutable",
        "Content-Type": "image/png",
      },
    });
    if (cache !== undefined) {
      context.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));
    }
    return response;
  });
}
