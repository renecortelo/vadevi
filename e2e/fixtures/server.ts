import { test as base } from "@playwright/test";

/**
 * Every browser test, given a server it can reach.
 *
 * `wrangler dev` has died mid-run on CI — an empty `✘ [ERROR]`, and the port is
 * gone. `scripts/serve-e2e.ts` now restarts it, but a restart takes a few
 * seconds and Playwright retries immediately, so on its own the retry would hit
 * a port still coming back up and fail exactly like the original.
 *
 * So each test waits for the server first. On a healthy run that is one request
 * that answers at once; after a crash it is the pause that lets the retry
 * actually retry. It never masks an application failure: a server that stays
 * down still fails the test, and says the server is down rather than
 * `ERR_CONNECTION_REFUSED` from wherever the test happened to be standing.
 */
export const test = base.extend<{ serverUp: void }>({
  serverUp: [
    async ({ baseURL, request }, use) => {
      const deadline = Date.now() + 60_000;
      // No initial value: every path through the loop sets it before it is read,
      // and seeding it would only put a placeholder in a real failure message.
      let lastError: string | undefined;
      for (;;) {
        try {
          const response = await request.get(`${baseURL}/health`, { timeout: 5_000 });
          if (response.ok()) break;
          lastError = `status ${response.status()}`;
        } catch (error) {
          lastError = error instanceof Error ? error.message : String(error);
        }
        if (Date.now() > deadline) {
          throw new Error(
            `The application server at ${baseURL} did not come back within 60s ` +
              `(${lastError ?? "no attempt completed"}). ` +
              "See the serve-e2e lines above for whether it crashed and restarted.",
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect, type Page } from "@playwright/test";
