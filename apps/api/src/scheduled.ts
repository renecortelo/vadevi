/** A scheduled task, named for the log. */
export type ScheduledStep = readonly [name: string, run: () => Promise<unknown>];

/**
 * Every step gets its turn, whatever happened to the one before: a housekeeping
 * failure must not hold back a deletion the user confirmed. The failures are
 * logged one by one and raised together at the end, so the run still shows as
 * failed.
 */
export async function runScheduledSteps(steps: readonly ScheduledStep[]): Promise<void> {
  const failed: string[] = [];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (error) {
      failed.push(name);
      console.error(
        JSON.stringify({
          errorName: error instanceof Error ? error.name : "UnknownError",
          level: "error",
          scheduledStep: name,
        }),
      );
    }
  }
  if (failed.length > 0) throw new Error(`Scheduled steps failed: ${failed.join(", ")}`);
}
