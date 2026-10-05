import { z } from "@hono/zod-openapi";

import { SupportedLocaleSchema } from "./session";

/**
 * The wine library: reference knowledge about grapes, the same for every
 * reader, built from open sources with the sentence behind each value.
 */
export const LibraryLevelSchema = z.enum(["low", "medium", "high"]);

export const LibraryEvidenceSchema = z
  .object({
    field: z.string(),
    quote: z.string(),
    sourceUrl: z.string().url(),
    value: z.string(),
  })
  .strict();

/**
 * A picture, served by the app itself, with what its licence asks to be
 * shown beside it.
 */
export const LibraryImageSchema = z
  .object({
    author: z.string(),
    license: z.string(),
    licenseUrl: z.string().url().nullable(),
    path: z.string().regex(/^library\/[a-z0-9/._-]+$/),
    sourceUrl: z.string().url(),
  })
  .strict();

export const LibraryGrapeSchema = z
  .object({
    acidity: LibraryLevelSchema.nullable(),
    aromas: z.array(z.string()),
    body: LibraryLevelSchema.nullable(),
    color: z.enum(["white", "red", "pink"]).nullable(),
    evidence: z.array(LibraryEvidenceSchema),
    id: z.string(),
    image: LibraryImageSchema.nullable(),
    name: z.string(),
    originCountryCode: z.string().length(2).nullable(),
    pairings: z.array(z.string()),
    regions: z.array(
      z
        .object({
          countryCode: z.string().nullable(),
          name: z.string(),
          // The atlas entry this region is, where it is a registered name.
          regionId: z.string().nullable(),
        })
        .strict(),
    ),
    styles: z.array(z.string()),
    summary: z
      .object({
        license: z.string(),
        locale: z.string(),
        sourceUrl: z.string().url(),
        text: z.string(),
        translated: z.boolean(),
      })
      .strict()
      .nullable(),
    /**
     * What the wine goes with by the application's pairing rules — not by the
     * source. `basis` says how its styles were chosen: named for this grape by
     * the sources the rules cite, or placed by the grape's colour and
     * structure. `groups` keeps each style's dishes apart (a dry and a sweet
     * Riesling do not go with the same things); `families` is all of them,
     * less any the grape's own source already names. Null when neither is
     * known well enough to say.
     */
    suggestedPairings: z
      .object({
        basis: z.enum(["catalogue", "profile"]),
        families: z.array(z.string()),
        groups: z.array(
          z
            .object({
              basis: z.enum(["catalogue", "profile"]),
              families: z.array(z.string()),
              style: z.string(),
            })
            .strict(),
        ),
        styles: z.array(z.string()),
      })
      .strict()
      .nullable(),
    synonyms: z.array(z.string()),
    tannin: LibraryLevelSchema.nullable(),
    wikidataId: z.string(),
  })
  .strict()
  .openapi("LibraryGrape");

export const LibraryGrapeResponseSchema = z
  .object({ data: LibraryGrapeSchema })
  .strict()
  .openapi("LibraryGrapeResponse");

export const LibraryGrapeQuerySchema = z
  .object({ locale: SupportedLocaleSchema.default("en") })
  .strict();

/** By name; without one, every grape — the library's list. */
export const LibrarySearchQuerySchema = z
  .object({
    locale: SupportedLocaleSchema.default("en"),
    query: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

export const LibrarySearchResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          color: z.enum(["white", "red", "pink"]).nullable(),
          id: z.string(),
          imagePath: z.string().nullable(),
          name: z.string(),
          originCountryCode: z.string().length(2).nullable(),
        })
        .strict(),
    ),
  })
  .strict()
  .openapi("LibrarySearchResponse");

export const LibraryGrapePathSchema = z
  .object({ grapeId: z.string().regex(/^[a-z0-9-]{1,80}$/) })
  .strict();

/** A protected wine name from the EU register, with what the library adds. */
export const LibraryRegionSchema = z
  .object({
    countryCode: z.string().length(2),
    eambrosiaId: z.string(),
    giType: z.enum(["PDO", "PGI"]),
    grapes: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          quote: z.string(),
          sourceUrl: z.string().url(),
        })
        .strict(),
    ),
    id: z.string(),
    latitude: z.number().nullable(),
    legalUrl: z.string().url().nullable(),
    longitude: z.number().nullable(),
    name: z.string(),
    otherNames: z.array(z.string()),
    /**
     * Where the point comes from: the wine's own item, or — approximately —
     * the area it lies in or the town it is named after. Null without one.
     */
    pointSource: z.enum(["item", "area", "place"]).nullable(),
    registeredOn: z.string().nullable(),
    summary: z
      .object({
        license: z.string(),
        locale: z.string(),
        sourceUrl: z.string().url(),
        text: z.string(),
        /** A faithful translation of the article at `sourceUrl`. */
        translated: z.boolean(),
      })
      .strict()
      .nullable(),
    wikidataId: z.string().nullable(),
  })
  .strict()
  .openapi("LibraryRegion");

export const LibraryRegionResponseSchema = z
  .object({ data: LibraryRegionSchema })
  .strict()
  .openapi("LibraryRegionResponse");

/** By name, in a country, or both; a country alone lists all of its names. */
export const LibraryRegionSearchQuerySchema = z
  .object({
    country: z
      .string()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    query: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

export const LibraryRegionPathSchema = z
  .object({ regionId: z.string().regex(/^[a-z]{2}-[a-z0-9-]{1,120}$/) })
  .strict();

export const LibraryRegionSearchResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          countryCode: z.string(),
          giType: z.enum(["PDO", "PGI"]),
          id: z.string(),
          name: z.string(),
        })
        .strict(),
    ),
  })
  .strict()
  .openapi("LibraryRegionSearchResponse");

/**
 * A style or a method: a kind of wine, a way of growing or making it, or a
 * concept, explained from its Wikipedia article in the reader's language.
 */
export const LibraryTopicSchema = z
  .object({
    category: z.enum(["kind", "farming", "method", "concept"]),
    id: z.string(),
    name: z.string(),
    otherNames: z.array(z.string()),
    summary: z
      .object({
        license: z.string(),
        locale: z.string(),
        sourceUrl: z.string().url(),
        text: z.string(),
        /** A faithful translation of the article at `sourceUrl`. */
        translated: z.boolean(),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .openapi("LibraryTopic");

export const LibraryTopicsResponseSchema = z
  .object({ data: z.array(LibraryTopicSchema) })
  .strict()
  .openapi("LibraryTopicsResponse");

export const LibraryTopicResponseSchema = z
  .object({ data: LibraryTopicSchema })
  .strict()
  .openapi("LibraryTopicResponse");

export const LibraryTopicPathSchema = z
  .object({ topicId: z.string().regex(/^[a-z0-9-]{1,60}$/) })
  .strict();

export type LibraryTopic = z.infer<typeof LibraryTopicSchema>;
export type LibraryRegion = z.infer<typeof LibraryRegionSchema>;
export type LibraryGrape = z.infer<typeof LibraryGrapeSchema>;
export type LibraryGrapeResponse = z.infer<typeof LibraryGrapeResponseSchema>;
export type LibrarySearchResponse = z.infer<typeof LibrarySearchResponseSchema>;
