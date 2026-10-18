import { describe, expect, it } from "vitest";

import { libraryDiffSql } from "./library-sql";

describe("the library as SQL", () => {
  it("keeps every statement under D1's size cap, however long the rows", () => {
    // Fifty grapes' worth of quoted facts ran past 100 KB in one statement.
    const rows = Array.from({ length: 60 }, (_, index) => [`grape-${index}`, "x".repeat(5_000)]);
    const { statements } = libraryDiffSql(
      [{ columns: ["id", "facts"], indexes: 0, key: ["id"], rows, table: "kb_grapes" }],
      {},
    );
    expect(statements.length).toBeGreaterThan(1);
    for (const statement of statements) {
      expect(new TextEncoder().encode(statement).length).toBeLessThan(100_000);
    }
    expect(statements.join("").match(/\('grape-/g)?.length).toBe(60);
  });
});
