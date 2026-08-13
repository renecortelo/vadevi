import { z } from "@hono/zod-openapi";

const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const SupportedLocaleSchema = z.enum(["ca", "es", "fr", "en", "it", "pt-PT", "nl", "de"]);

export const RuntimeConfigResponseSchema = z
  .object({
    data: z
      .object({
        appEnvironment: z.enum(["local", "preview", "production"]),
        firebase: z
          .object({
            apiKey: z.string().min(1),
            authDomain: z.string().min(1),
            emulatorHost: z.string().min(1).optional(),
            projectId: z.string().min(1),
          })
          .strict(),
        features: z
          .object({
            assistant: z.boolean(),
            externalResearch: z.boolean(),
            priceLookup: z.boolean(),
            voiceInput: z.boolean(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .openapi("RuntimeConfigResponse");

export const UpdateProfileRequestSchema = z
  .object({
    activeSpaceId: UlidSchema.optional(),
    completeOnboarding: z.literal(true).optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    preferredLocale: SupportedLocaleSchema.optional(),
  })
  .strict()
  .refine(
    (request: Record<string, unknown>) =>
      Object.values(request).some((value) => value !== undefined),
    {
      message: "At least one profile field is required.",
    },
  )
  .openapi("UpdateProfileRequest");

export const BootstrapResponseSchema = z
  .object({
    data: z
      .object({
        features: z
          .object({
            assistant: z.boolean(),
            externalResearch: z.boolean(),
            priceLookup: z.boolean(),
            voiceInput: z.boolean(),
          })
          .strict(),
        spaces: z.array(
          z
            .object({
              id: UlidSchema,
              name: z.string().min(1).max(120),
              role: z.enum(["owner", "admin", "member"]),
              type: z.enum(["personal", "couple", "group"]),
            })
            .strict(),
        ),
        user: z
          .object({
            activeSpaceId: UlidSchema,
            displayName: z.string().min(1).max(120),
            id: UlidSchema,
            onboardingComplete: z.boolean(),
            preferredLocale: SupportedLocaleSchema,
          })
          .strict(),
        versions: z
          .object({
            api: z.string().min(1),
            i18nCatalog: z.string().min(1),
            tastingOntology: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .openapi("BootstrapResponse");

export type BootstrapResponse = z.infer<typeof BootstrapResponseSchema>;
export type RuntimeConfigResponse = z.infer<typeof RuntimeConfigResponseSchema>;
export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;
export type UpdateProfileRequest = z.infer<typeof UpdateProfileRequestSchema>;
