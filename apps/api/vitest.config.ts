import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.resolve(import.meta.dirname, "../../migrations"));

  return {
    plugins: [
      cloudflareTest({
        wrangler: {
          configPath: "./wrangler.test.jsonc",
        },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      fileParallelism: false,
      include: ["tests/**/*.test.ts"],
      maxWorkers: 1,
      // Every request writes a metrics line (Q-04); in tests it would bury the
      // output. `request-metrics.test.ts` reads them through a spy instead.
      onConsoleLog: (log: string) => !log.startsWith('{"level":"info","message":"request"'),
    },
  };
});
