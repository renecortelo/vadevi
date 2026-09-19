import { z } from "@hono/zod-openapi";

import { ResourceIdSchema, ResourceTimestampSchema } from "./wine-memory";

/**
 * Who may sign in to a private deployment, as its administrator sees it.
 *
 * The list is e-mails. Beside each entry is whether that person has ever
 * signed in, so the administrator can tell an invitation that was taken up
 * from one that was not, and can remove an account that never arrived.
 */
export const AllowedAccountSchema = z
  .object({
    addedAt: ResourceTimestampSchema,
    email: z.string().email().max(254),
    note: z.string().max(200).nullable(),
    /** Set once that e-mail has signed in and been given an account. */
    userId: ResourceIdSchema.nullable(),
  })
  .strict();

export const AllowedAccountsResponseSchema = z
  .object({
    data: z
      .object({
        accounts: z.array(AllowedAccountSchema),
        /** The administrators, who need no entry and cannot be removed here. */
        admins: z.array(z.string().email()),
        mode: z.enum(["allowlist", "open"]),
      })
      .strict(),
  })
  .strict()
  .openapi("AllowedAccountsResponse");

export const AddAllowedAccountRequestSchema = z
  .object({
    email: z.string().trim().toLowerCase().email().max(254),
    note: z.string().trim().max(200).optional(),
  })
  .strict()
  .openapi("AddAllowedAccountRequest");

export const AllowedAccountPathSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .email()
      .max(254)
      .openapi({ param: { in: "path", name: "email" } }),
  })
  .strict();

export type AllowedAccount = z.infer<typeof AllowedAccountSchema>;
export type AllowedAccountsResponse = z.infer<typeof AllowedAccountsResponseSchema>;
export type AddAllowedAccountRequest = z.infer<typeof AddAllowedAccountRequestSchema>;
