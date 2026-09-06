import { z } from "@hono/zod-openapi";

import { SupportedLocaleSchema } from "./session";

/**
 * Venue lookup for "where did we taste this".
 *
 * The reader types a place and picks one; the answer carries a point, so the same
 * bar twice is the same bar. The optional `near` is the reader's OWN position and
 * only ever travels when they asked to search around themselves — which is why
 * these are POST bodies rather than query strings: a position does not belong in
 * a URL, where it would reach access logs and history.
 */
export const CoordinateSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();

export const PlaceSearchRequestSchema = z
  .object({
    locale: SupportedLocaleSchema,
    near: CoordinateSchema.optional(),
    query: z.string().trim().min(3).max(200),
  })
  .strict()
  .openapi("PlaceSearchRequest");

export const PlaceReverseRequestSchema = z
  .object({
    latitude: z.number().min(-90).max(90),
    locale: SupportedLocaleSchema,
    longitude: z.number().min(-180).max(180),
  })
  .strict()
  .openapi("PlaceReverseRequest");

export const PlaceCandidateSchema = z
  .object({
    area: z.string().min(1).max(160).nullable(),
    city: z.string().min(1).max(160).nullable(),
    countryCode: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .nullable(),
    displayName: z.string().min(1).max(300),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    name: z.string().min(1).max(200),
  })
  .strict();

export const PlaceCandidatesResponseSchema = z
  .object({ data: z.object({ places: z.array(PlaceCandidateSchema).max(6) }).strict() })
  .strict()
  .openapi("PlaceCandidatesResponse");

export type PlaceCandidatesResponse = z.infer<typeof PlaceCandidatesResponseSchema>;
export type PlaceReverseRequest = z.infer<typeof PlaceReverseRequestSchema>;
export type PlaceSearchRequest = z.infer<typeof PlaceSearchRequestSchema>;
