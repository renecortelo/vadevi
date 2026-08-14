import { z } from "@hono/zod-openapi";

import { ResourceIdSchema, ResourceTimestampSchema } from "./wine-memory";

export const EvidenceClassSchema = z.enum(["observed", "researched", "inferred", "personal"]);
export const FactStatusSchema = z.enum(["proposed", "accepted", "disputed", "retired"]);
export const FactSubjectTypeSchema = z.enum([
  "wine",
  "producer",
  "grape",
  "region",
  "price_observation",
]);
export const FactPredicateSchema = z.enum([
  "identity.canonical_name",
  "identity.grape_codes",
  "producer.founded_year",
  "producer.history",
  "producer.name",
  "region.name",
  "production.aging_months",
  "production.method",
  "curiosity.note",
  "further_reading.summary",
]);
export const SourceTypeSchema = z.enum([
  "producer",
  "regulator",
  "specialist",
  "open_dataset",
  "other_web",
  "user_artifact",
]);
export const CitationSupportStrengthSchema = z.enum(["direct", "supporting", "context"]);

const FactCodeSchema = z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/);
export const FactValueSchema = z.union([
  z.string().trim().min(1).max(2_000),
  z.number().finite(),
  z.boolean(),
  z.array(FactCodeSchema).min(1).max(20),
]);

function predicateValueIsValid(predicate: z.infer<typeof FactPredicateSchema>, value: unknown) {
  switch (predicate) {
    case "identity.canonical_name":
    case "producer.history":
    case "producer.name":
    case "region.name":
    case "production.method":
    case "curiosity.note":
    case "further_reading.summary":
      return typeof value === "string";
    case "identity.grape_codes":
      return Array.isArray(value);
    case "producer.founded_year":
      return typeof value === "number" && Number.isInteger(value) && value >= 1000 && value <= 2100;
    case "production.aging_months":
      return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 1_200;
  }
}

function isSafeHttpsSourceUrl(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.endsWith(".local") ||
      host.endsWith(".internal") ||
      host.includes(":")
    ) {
      return false;
    }
    const octets = host.split(".").map(Number);
    if (octets.length === 4 && octets.every((octet) => Number.isInteger(octet))) {
      const [first, second] = octets;
      return !(
        first === 0 ||
        first === 10 ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second !== undefined && second >= 16 && second <= 31) ||
        (first === 192 && second === 168) ||
        first! >= 224
      );
    }
    return true;
  } catch {
    return false;
  }
}

export const HttpsSourceUrlSchema = z
  .string()
  .url()
  .max(2_048)
  .refine(isSafeHttpsSourceUrl, "Use a public HTTPS URL without credentials.");

export const CreateSourceRequestSchema = z
  .object({
    canonicalUrl: HttpsSourceUrlSchema,
    clientId: ResourceIdSchema.optional(),
    contentHash: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .optional(),
    lastCheckedAt: ResourceTimestampSchema.optional(),
    licenseIdentifier: z.string().trim().min(1).max(120).optional(),
    publisher: z.string().trim().min(1).max(160),
    retrievedAt: ResourceTimestampSchema,
    sourceType: SourceTypeSchema,
    title: z.string().trim().min(1).max(300),
  })
  .strict()
  .openapi("CreateSourceRequest");

export const SourceSchema = CreateSourceRequestSchema.omit({ clientId: true })
  .extend({
    canonicalUrl: HttpsSourceUrlSchema,
    createdAt: ResourceTimestampSchema,
    createdByProvider: z.string().nullable(),
    createdByUserId: ResourceIdSchema.nullable(),
    id: ResourceIdSchema,
    updatedAt: ResourceTimestampSchema,
  })
  .strict();

export const SourceResponseSchema = z
  .object({ data: SourceSchema })
  .strict()
  .openapi("SourceResponse");

export const FactCitationInputSchema = z
  .object({
    locator: z.string().trim().min(1).max(500).optional(),
    sourceId: ResourceIdSchema,
    supportStrength: CitationSupportStrengthSchema,
  })
  .strict();

const CreateWineFactBaseSchema = z
  .object({
    citations: z.array(FactCitationInputSchema).max(8).default([]),
    clientId: ResourceIdSchema.optional(),
    confidenceMilli: z.number().int().min(0).max(1_000).optional(),
    evidenceClass: EvidenceClassSchema,
    predicate: FactPredicateSchema,
    value: FactValueSchema,
  })
  .strict();

export const CreateWineFactRequestSchema = CreateWineFactBaseSchema.superRefine(
  (input: z.infer<typeof CreateWineFactBaseSchema>, context: z.RefinementCtx) => {
    if (!predicateValueIsValid(input.predicate, input.value)) {
      context.addIssue({
        code: "custom",
        message: "The value does not match the registered predicate.",
        path: ["value"],
      });
    }
    if (input.evidenceClass === "researched" && input.citations.length === 0) {
      context.addIssue({
        code: "custom",
        message: "A researched fact requires at least one citation.",
        path: ["citations"],
      });
    }
    if (
      new Set(input.citations.map((citation: { sourceId: string }) => citation.sourceId)).size !==
      input.citations.length
    ) {
      context.addIssue({
        code: "custom",
        message: "A source may be cited only once per fact.",
        path: ["citations"],
      });
    }
  },
).openapi("CreateWineFactRequest");

export const FactCitationSchema = z
  .object({
    locator: z.string().nullable(),
    source: SourceSchema,
    supportStrength: CitationSupportStrengthSchema,
  })
  .strict();

export const FactSchema = z
  .object({
    citations: z.array(FactCitationSchema),
    confidenceMilli: z.number().int().min(0).max(1_000).nullable(),
    createdAt: ResourceTimestampSchema,
    evidenceClass: EvidenceClassSchema,
    id: ResourceIdSchema,
    observedByUserId: ResourceIdSchema.nullable(),
    predicate: FactPredicateSchema,
    researchMethod: z.string().nullable(),
    status: FactStatusSchema,
    subjectId: ResourceIdSchema,
    subjectType: FactSubjectTypeSchema,
    updatedAt: ResourceTimestampSchema,
    value: FactValueSchema,
    verifiedAt: ResourceTimestampSchema.nullable(),
    verifiedByUserId: ResourceIdSchema.nullable(),
    version: z.number().int().positive(),
  })
  .strict();

export const FactResponseSchema = z.object({ data: FactSchema }).strict().openapi("FactResponse");

export const FactConflictSchema = z
  .object({
    acceptedFactId: ResourceIdSchema.nullable(),
    factIds: z.array(ResourceIdSchema).min(2),
    predicate: FactPredicateSchema,
  })
  .strict();

export const WineFactsResponseSchema = z
  .object({
    data: z
      .object({
        conflicts: z.array(FactConflictSchema),
        facts: z.array(FactSchema),
      })
      .strict(),
  })
  .strict()
  .openapi("WineFactsResponse");

export const AcceptFactRequestSchema = z
  .object({ version: z.number().int().positive() })
  .strict()
  .openapi("AcceptFactRequest");

export const WineFactsPathSchema = z
  .object({
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
    wineId: ResourceIdSchema.openapi({ param: { in: "path", name: "wineId" } }),
  })
  .strict();

export const FactIdPathSchema = z
  .object({
    factId: ResourceIdSchema.openapi({ param: { in: "path", name: "factId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export const SourceIdPathSchema = z
  .object({
    sourceId: ResourceIdSchema.openapi({ param: { in: "path", name: "sourceId" } }),
    spaceId: ResourceIdSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export type AcceptFactRequest = z.infer<typeof AcceptFactRequestSchema>;
export type CreateSourceRequest = z.infer<typeof CreateSourceRequestSchema>;
export type CreateWineFactRequest = z.infer<typeof CreateWineFactRequestSchema>;
export type Fact = z.infer<typeof FactSchema>;
export type FactResponse = z.infer<typeof FactResponseSchema>;
export type Source = z.infer<typeof SourceSchema>;
export type SourceResponse = z.infer<typeof SourceResponseSchema>;
export type WineFactsResponse = z.infer<typeof WineFactsResponseSchema>;
