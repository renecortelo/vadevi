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

/**
 * How a register designates a protected wine name: the EU's PDO and PGI, and
 * other countries' own — the American Viticultural Area of 27 CFR part 9, New
 * Zealand's and Australia's geographical indications, South Africa's Wine of
 * Origin, Chile's denominations of origin.
 */
export const RegionDesignationSchema = z.enum(["PDO", "PGI", "AVA", "GI", "WO", "DO"]);
export type RegionDesignation = z.infer<typeof RegionDesignationSchema>;

/**
 * The kinds of area a register names: Australia's (country, multi-state
 * zone, state, super zone, zone, region, subregion), South Africa's Wine of
 * Origin scheme's (geographical unit … ward) and Chile's (region, subregion,
 * zone, area). Each register's are largest first.
 */
export const RegionLevelSchema = z.enum([
  "country",
  "multiStateZone",
  "state",
  "superZone",
  "zone",
  "overarchingUnit",
  "unit",
  "overarchingRegion",
  "region",
  "subregion",
  "district",
  "ward",
  "area",
]);
export type RegionLevel = z.infer<typeof RegionLevelSchema>;

const RegionLinkSchema = z
  .object({ id: z.string(), level: RegionLevelSchema.nullable(), name: z.string() })
  .strict();

/** A protected wine name from its register, with what the library adds. */
export const LibraryRegionSchema = z
  .object({
    /** The names whose area lies within this one's, directly: a district's wards. */
    contains: z.array(RegionLinkSchema),
    countryCode: z.string().length(2),
    /** The EU register's id; null for a name another country's register holds. */
    eambrosiaId: z.string().nullable(),
    giType: RegionDesignationSchema,
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
     * Where the point comes from: inside the name's official boundary, the
     * wine's own item, or — approximately — the area it lies in or the town
     * it is named after. Null without one.
     */
    pointSource: z.enum(["boundary", "item", "area", "place"]).nullable(),
    registeredOn: z.string().nullable(),
    /** Its place in a register other than the EU's: "27 CFR 9.23", an IP number. */
    registerRef: z.string().nullable(),
    /** The kind of area, where its register has several: a Wine of Origin ward. */
    registerLevel: RegionLevelSchema.nullable(),
    /**
     * What the name's single document in the EU register says of its wines:
     * the categories of grapevine product it covers (their number in Annex
     * VII, Part II of Regulation (EU) No 1308/2013) and its main grape
     * varieties as the document writes them, with a grape card where the
     * variety is certainly that grape. Null where the document could not be
     * read.
     */
    register: z
      .object({
        categories: z.array(z.number().int()),
        grapes: z.array(z.object({ grapeId: z.string().nullable(), name: z.string() }).strict()),
        sourceUrl: z.string().url(),
      })
      .strict()
      .nullable(),
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
    /** The names whose area holds this one's, the nearest first. */
    within: z.array(RegionLinkSchema),
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
          giType: RegionDesignationSchema,
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

/** Registered names by id, as the register writes them. */
export const LibraryRegionNamesQuerySchema = z
  .object({
    /** Up to a hundred ids, comma-separated. */
    ids: z
      .string()
      .max(8_000)
      .openapi({ param: { in: "query", name: "ids" } }),
  })
  .strict();

export const LibraryRegionNamesResponseSchema = z
  .object({
    data: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  })
  .strict()
  .openapi("LibraryRegionNamesResponse");
