import { describe, expect, it } from "vitest";

import { createUlid } from "./ulid";

describe("client resource IDs", () => {
  it("creates unique, API-compatible ULIDs for offline resources", () => {
    const ids = Array.from({ length: 100 }, () => createUlid(1_786_598_400_000));
    expect(new Set(ids)).toHaveLength(100);
    for (const id of ids) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
