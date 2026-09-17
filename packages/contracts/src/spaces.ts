import { z } from "@hono/zod-openapi";

import { SupportedLocaleSchema } from "./session";

const UlidSchema = z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/);
const TimestampSchema = z.string().datetime({ offset: true });

export const IdempotencyKeySchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}$/, "Use a base64url-encoded 256-bit random value.");

export const CreateSpaceRequestSchema = z
  .object({
    defaultLocale: SupportedLocaleSchema,
    name: z.string().trim().min(1).max(120),
    type: z.enum(["couple", "group"]),
  })
  .strict()
  .openapi("CreateSpaceRequest");

/**
 * Renaming a Space, or changing the language its content defaults to.
 *
 * Owners only. A Space's name is what every member sees in their switcher, so
 * this is not a personal preference — and a Space named in a hurry stayed named
 * that way, because nothing could change it.
 *
 * `undefined` means "leave it", and `version` is the same optimistic lock the
 * other updates use.
 */
export const UpdateSpaceRequestSchema = z
  .object({
    defaultLocale: SupportedLocaleSchema.optional(),
    name: z.string().trim().min(1).max(120).optional(),
    version: z.number().int().positive(),
  })
  .strict()
  .openapi("UpdateSpaceRequest");

export type UpdateSpaceRequest = z.infer<typeof UpdateSpaceRequestSchema>;

export const SpaceDetailResponseSchema = z
  .object({
    data: z
      .object({
        members: z.array(
          z
            .object({
              displayName: z.string().min(1).max(120),
              id: UlidSchema,
              joinedAt: TimestampSchema,
              role: z.enum(["owner", "admin", "member"]),
              version: z.number().int().positive(),
            })
            .strict(),
        ),
        space: z
          .object({
            defaultLocale: SupportedLocaleSchema,
            id: UlidSchema,
            name: z.string().min(1).max(120),
            role: z.enum(["owner", "admin", "member"]),
            type: z.enum(["personal", "couple", "group"]),
            version: z.number().int().positive(),
          })
          .strict(),
      })
      .strict(),
  })
  .strict()
  .openapi("SpaceDetailResponse");

export const CreateInvitationRequestSchema = z
  .object({
    intendedRole: z.enum(["admin", "member"]),
  })
  .strict()
  .openapi("CreateInvitationRequest");

export const CreateInvitationResponseSchema = z
  .object({
    data: z
      .object({
        expiresAt: TimestampSchema,
        id: UlidSchema,
        intendedRole: z.enum(["admin", "member"]),
        invitationPath: z.string().regex(/^\/invitations\/[A-Za-z0-9_-]{43}$/),
        spaceId: UlidSchema,
      })
      .strict(),
  })
  .strict()
  .openapi("CreateInvitationResponse");

export const InvitationPreviewResponseSchema = z
  .object({
    data: z
      .object({
        expiresAt: TimestampSchema,
        intendedRole: z.enum(["admin", "member"]),
        inviterDisplayName: z.string().min(1).max(120),
        spaceName: z.string().min(1).max(120),
        spaceType: z.enum(["couple", "group"]),
      })
      .strict(),
  })
  .strict()
  .openapi("InvitationPreviewResponse");

export const RemoveMemberRequestSchema = z
  .object({
    baseVersion: z.number().int().positive(),
    status: z.literal("removed"),
  })
  .strict()
  .openapi("RemoveMemberRequest");

export const InvitationTokenPathSchema = z
  .object({
    token: z
      .string()
      .regex(/^[A-Za-z0-9_-]{43}$/)
      .openapi({ param: { in: "path", name: "token" } }),
  })
  .strict();

export const SpaceIdPathSchema = z
  .object({
    spaceId: UlidSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();
export const SpaceMemberPathSchema = z
  .object({
    memberId: UlidSchema.openapi({ param: { in: "path", name: "memberId" } }),
    spaceId: UlidSchema.openapi({ param: { in: "path", name: "spaceId" } }),
  })
  .strict();

export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;
export type CreateInvitationResponse = z.infer<typeof CreateInvitationResponseSchema>;
export type CreateSpaceRequest = z.infer<typeof CreateSpaceRequestSchema>;
export type InvitationPreviewResponse = z.infer<typeof InvitationPreviewResponseSchema>;
export type RemoveMemberRequest = z.infer<typeof RemoveMemberRequestSchema>;
export type SpaceDetailResponse = z.infer<typeof SpaceDetailResponseSchema>;
