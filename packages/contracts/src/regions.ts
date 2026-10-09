import { z } from "@hono/zod-openapi";

/**
 * Tidying a Space's regions: the same place written several ways, or a name
 * one letter away from one the EU register holds, offered one group at a
 * time for the reader to confirm. Nothing changes until they do.
 */
export const RegionProposalSchema = z
  .object({
    /** The region's country, where its wines or the register say. */
    countryCode: z.string().nullable(),
    /** The spellings to rename, each with how many wines carry it. */
    from: z.array(z.object({ region: z.string(), wines: z.number().int().positive() }).strict()),
    /** Why: one place written several ways, or a misspelling of a registered name. */
    reason: z.enum(["variants", "typo"]),
    /** The name proposed, as the register writes it where it holds it. */
    to: z.string(),
    /** Wines already written that way. */
    unchanged: z.number().int().nonnegative(),
  })
  .strict()
  .openapi("RegionProposal");

export const RegionProposalsResponseSchema = z
  .object({ data: z.array(RegionProposalSchema) })
  .strict()
  .openapi("RegionProposalsResponse");

export const RenameRegionsRequestSchema = z
  .object({
    from: z.array(z.string().min(1).max(160)).min(1).max(20),
    to: z.string().trim().min(1).max(160),
  })
  .strict()
  .openapi("RenameRegionsRequest");

export const RenameRegionsResponseSchema = z
  .object({ data: z.object({ renamed: z.number().int().nonnegative() }).strict() })
  .strict()
  .openapi("RenameRegionsResponse");

export type RegionProposal = z.infer<typeof RegionProposalSchema>;
export type RenameRegionsRequest = z.infer<typeof RenameRegionsRequestSchema>;

/** One producer written several ways, offered to confirm like a region. */
export const ProducerProposalSchema = z
  .object({
    from: z.array(z.object({ producer: z.string(), wines: z.number().int().positive() }).strict()),
    to: z.string(),
    unchanged: z.number().int().nonnegative(),
  })
  .strict()
  .openapi("ProducerProposal");

export const ProducerProposalsResponseSchema = z
  .object({ data: z.array(ProducerProposalSchema) })
  .strict()
  .openapi("ProducerProposalsResponse");

export type ProducerProposal = z.infer<typeof ProducerProposalSchema>;
