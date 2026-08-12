import { z } from "zod";

export const RoleSchema = z.enum(["owner", "admin", "member"]);
export type Role = z.infer<typeof RoleSchema>;

export type AuthorizationContext = Readonly<{
  requestId: string;
  userId: string;
  spaceId: string;
  role: Role;
}>;

export type SpaceCapability =
  | "read"
  | "create-domain-record"
  | "edit-own-note"
  | "correct-wine"
  | "invite-member"
  | "remove-member"
  | "change-role"
  | "configure-space"
  | "delete-space"
  | "transfer-ownership";

const roleCapabilities = {
  owner: new Set<SpaceCapability>([
    "read",
    "create-domain-record",
    "edit-own-note",
    "correct-wine",
    "invite-member",
    "remove-member",
    "change-role",
    "configure-space",
    "delete-space",
    "transfer-ownership",
  ]),
  admin: new Set<SpaceCapability>([
    "read",
    "create-domain-record",
    "edit-own-note",
    "correct-wine",
    "invite-member",
    "remove-member",
    "configure-space",
  ]),
  member: new Set<SpaceCapability>([
    "read",
    "create-domain-record",
    "edit-own-note",
    "correct-wine",
  ]),
} satisfies Record<Role, ReadonlySet<SpaceCapability>>;

export function can(role: Role, capability: SpaceCapability): boolean {
  return roleCapabilities[role].has(capability);
}
