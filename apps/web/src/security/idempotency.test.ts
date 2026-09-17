import { describe, expect, it } from "vitest";

import { idempotencyKeyForMutation } from "./idempotency";

describe("idempotencyKeyForMutation", () => {
  it("derives a stable endpoint-compatible key", async () => {
    const mutationId = "01ARZ3NDEKTSV4RRFFQ69G5FAV";
    const first = await idempotencyKeyForMutation(mutationId);
    const replay = await idempotencyKeyForMutation(mutationId);
    const other = await idempotencyKeyForMutation("01ARZ3NDEKTSV4RRFFQ69G5FAW");

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(replay).toBe(first);
    expect(other).not.toBe(first);
  });
});
