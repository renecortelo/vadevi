import { describe, expect, it, vi } from "vitest";

import { runScheduledSteps } from "../src/scheduled";

describe("scheduled steps", () => {
  it("gives every step its turn and reports the failures at the end", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ran: string[] = [];
    await expect(
      runScheduledSteps([
        ["housekeeping", () => Promise.reject(new Error("R2 said no"))],
        ["deletion", async () => void ran.push("deletion")],
      ]),
    ).rejects.toThrow("Scheduled steps failed: housekeeping");
    expect(ran).toEqual(["deletion"]);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });

  it("is quiet when nothing fails", async () => {
    await expect(runScheduledSteps([["deletion", async () => undefined]])).resolves.toBeUndefined();
  });
});
