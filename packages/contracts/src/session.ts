import { z } from "@hono/zod-openapi";

const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);

export const SupportedLocaleSchema = z.enum(["ca", "es", "fr", "en", "it", "pt-PT", "nl", "de"]);

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
export type SupportedLocale = z.infer<typeof SupportedLocaleSchema>;
