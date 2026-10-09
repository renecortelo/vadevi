import { z } from "@hono/zod-openapi";

import { CurrencyCodeSchema } from "./cellar";

/**
 * A reader's taste, read from their own submitted tastings in every Space
 * they belong to — and from what they bought — with nothing added.
 *
 * Every trait is measured against the reader's own average score, so "high"
 * and "low" mean high and low for them: a generous scorer and a severe one
 * both have wines they rate above their usual. A trait is said only when at
 * least three tastings show it, and the fewer there are the more it is drawn
 * back towards the average, so two bottles never read as a taste. Each trait
 * carries how many tastings it rests on and the wines behind it.
 */
export const tasteTraitKinds = [
  "type",
  "country",
  "region",
  "grape",
  "descriptor",
  "acidity",
  "tannin",
  "body",
  "sweetness",
  "finish",
  "price",
] as const;

const CountSchema = z.number().int().nonnegative();

const WineRefSchema = z
  .object({ spaceId: z.string(), wineId: z.string(), wineName: z.string() })
  .strict();

export const TasteTraitSchema = z
  .object({
    /**
     * What the trait is, as a key the app names in the reader's language:
     * a wine type ("red"), a country code ("ES"), a region or grape as
     * recorded ("Empordà"), a descriptor code ("fruit.red.cherry"), a level
     * of structure ("high") or a price band ("EUR:20_40").
     */
    key: z.string(),
    kind: z.enum(tasteTraitKinds),
    /** How it reads where the app has no name of its own for it. */
    label: z.string(),
    /** Tastings it rests on. */
    notes: CountSchema,
    /** Points above (or below) the reader's own average, drawn towards 0 when few. */
    pointsVersusAverage: z.number(),
    /** Up to three of the wines behind it, best (or worst) first. */
    wines: z.array(WineRefSchema).max(3),
  })
  .strict();

export const TasteProfileSchema = z
  .object({
    averageScore: z.number().min(0).max(100).nullable(),
    /** How far the reader's scores usually sit from their average. */
    scoreSpread: z.number().nonnegative().nullable(),
    confidence: z.enum(["insufficient", "low", "medium", "high"]),
    /** Traits they score above their average… */
    likes: z.array(TasteTraitSchema),
    /** …and below it. */
    dislikes: z.array(TasteTraitSchema),
    /** What they taste most of but score below their average. */
    tensions: z.array(TasteTraitSchema),
    habits: z
      .object({
        /** What they taste most often, by kind. */
        mostTasted: z.array(
          z
            .object({
              key: z.string(),
              kind: z.enum(tasteTraitKinds),
              label: z.string(),
              notes: CountSchema,
              /** Share of their tastings, 0–1. */
              share: z.number().min(0).max(1),
            })
            .strict(),
        ),
        /** What a bottle usually costs them, each currency apart. */
        prices: z.array(
          z
            .object({
              currency: CurrencyCodeSchema,
              medianUnitMinor: CountSchema,
              purchases: CountSchema,
            })
            .strict(),
        ),
        /** Wines they bought more than once. */
        rebought: z.array(WineRefSchema.extend({ purchases: CountSchema }).strict()),
        /** Wines they bought and then scored well below their average. */
        boughtNotLiked: z.array(
          WineRefSchema.extend({ score: z.number().int().min(0).max(100) }).strict(),
        ),
      })
      .strict(),
    /** The last twelve months against the time before, when both have enough. */
    evolution: z
      .object({
        earlierAverage: z.number().nullable(),
        earlierNotes: CountSchema,
        recentAverage: z.number().nullable(),
        recentNotes: CountSchema,
        shifts: z.array(
          z
            .object({
              earlierShare: z.number().min(0).max(1),
              key: z.string(),
              kind: z.enum(tasteTraitKinds),
              label: z.string(),
              recentShare: z.number().min(0).max(1),
            })
            .strict(),
        ),
      })
      .strict()
      .nullable(),
    /** Unopened bottles in their cellars that share what they like most. */
    inCellar: z.array(
      WineRefSchema.extend({
        matches: z.array(
          z.object({ key: z.string(), kind: z.enum(tasteTraitKinds), label: z.string() }).strict(),
        ),
      }).strict(),
    ),
    minimumNotes: z.literal(3),
    sampleSize: CountSchema,
    scored: CountSchema,
  })
  .strict()
  .openapi("TasteProfile");

export const TasteProfileResponseSchema = z
  .object({ data: TasteProfileSchema })
  .strict()
  .openapi("TasteProfileResponse");

export type TasteProfile = z.infer<typeof TasteProfileSchema>;
export type TasteTrait = z.infer<typeof TasteTraitSchema>;
export type TasteTraitKind = (typeof tasteTraitKinds)[number];
