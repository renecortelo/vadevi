import { z } from "@hono/zod-openapi";

import { CurrencyCodeSchema } from "./cellar";

/**
 * A reader's numbers: what they have tasted, bought and kept, counted from
 * their own records and nothing else — no model, no estimate. "personal" is
 * the reader's own notes, purchases and bottles across every Space they are an
 * active member of; "space" is everyone's in one Space.
 *
 * Money is never added across currencies: each currency is its own total.
 */
const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const WineStatsQuerySchema = z
  .object({
    /** The first day counted (inclusive); everything before it when absent. */
    from: IsoDateSchema.optional().openapi({ param: { in: "query", name: "from" } }),
    /** The last day counted (inclusive); everything since when absent. */
    to: IsoDateSchema.optional().openapi({ param: { in: "query", name: "to" } }),
  })
  .strict();

const CountSchema = z.number().int().nonnegative();
const BucketSchema = z.object({ count: CountSchema, key: z.string() }).strict();
const AnswersSchema = z.object({ no: CountSchema, unsure: CountSchema, yes: CountSchema }).strict();

export const scoreBands = ["under_80", "80_84", "85_89", "90_94", "95_100"] as const;

export const WineStatsSchema = z
  .object({
    bestValue: z.array(
      z
        .object({
          currency: CurrencyCodeSchema,
          /** What one point of the reader's best score cost, in minor units. */
          perPointMinor: z.number().nonnegative(),
          producerName: z.string(),
          score: z.number().int().min(0).max(100),
          spaceId: z.string(),
          unitAmountMinor: CountSchema,
          wineId: z.string(),
          wineName: z.string(),
        })
        .strict(),
    ),
    cellar: z
      .object({
        /** Days from acquiring a bottle to opening it, on average. */
        averageDaysToOpen: z.number().nonnegative().nullable(),
        finished: CountSchema,
        gifted: CountSchema,
        opened: CountSchema,
        owned: CountSchema,
      })
      .strict(),
    period: z.object({ from: IsoDateSchema.nullable(), to: IsoDateSchema.nullable() }).strict(),
    scope: z.enum(["personal", "space"]),
    spaceId: z.string().nullable(),
    spending: z.array(
      z
        .object({
          averageBottleMinor: CountSchema.nullable(),
          bottles: CountSchema,
          byYear: z.array(z.object({ totalMinor: CountSchema, year: z.string() }).strict()),
          currency: CurrencyCodeSchema,
          purchases: CountSchema,
          topMerchants: z.array(
            z
              .object({ name: z.string(), purchases: CountSchema, totalMinor: CountSchema })
              .strict(),
          ),
          totalMinor: CountSchema,
        })
        .strict(),
    ),
    tastings: z
      .object({
        atOrAbove90: CountSchema,
        averageScore: z.number().min(0).max(100).nullable(),
        byMonth: z.array(z.object({ count: CountSchema, month: z.string() }).strict()),
        memorable: CountSchema,
        /** The pairings the reader rated, on their 1–5 scale. */
        pairingSuccessAverage: z.number().min(1).max(5).nullable(),
        scoreBands: z.array(z.object({ band: z.enum(scoreBands), count: CountSchema }).strict()),
        scored: CountSchema,
        topWines: z.array(
          z
            .object({
              producerName: z.string(),
              score: z.number().int().min(0).max(100),
              spaceId: z.string(),
              wineId: z.string(),
              wineName: z.string(),
            })
            .strict(),
        ),
        total: CountSchema,
        wouldBuy: AnswersSchema,
        wouldDrinkAgain: AnswersSchema,
      })
      .strict(),
    /** Wines recorded, tasted, bought or kept, each counted once. */
    wines: z
      .object({
        byCountry: z.array(BucketSchema),
        byGrape: z.array(BucketSchema),
        byRegion: z.array(BucketSchema),
        byType: z.array(BucketSchema),
        total: CountSchema,
      })
      .strict(),
    wishlist: z.object({ active: CountSchema }).strict(),
  })
  .strict()
  .openapi("WineStats");

export const WineStatsResponseSchema = z
  .object({ data: WineStatsSchema })
  .strict()
  .openapi("WineStatsResponse");

export type ScoreBand = (typeof scoreBands)[number];
export type WineStats = z.infer<typeof WineStatsSchema>;
export type WineStatsQuery = z.infer<typeof WineStatsQuerySchema>;
export type WineStatsResponse = z.infer<typeof WineStatsResponseSchema>;
