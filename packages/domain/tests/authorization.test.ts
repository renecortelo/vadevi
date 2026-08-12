import { describe, expect, it } from "vitest";

import { can } from "../src";

describe("Space role policy", () => {
  it("allows every active role to read and create domain records", () => {
    for (const role of ["owner", "admin", "member"] as const) {
      expect(can(role, "read")).toBe(true);
      expect(can(role, "create-domain-record")).toBe(true);
    }
  });

  it("reserves ownership and role changes for the owner", () => {
    expect(can("owner", "transfer-ownership")).toBe(true);
    expect(can("admin", "transfer-ownership")).toBe(false);
    expect(can("member", "change-role")).toBe(false);
  });
});
