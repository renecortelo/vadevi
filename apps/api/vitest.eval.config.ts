import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import path from "node:path";
import { defineConfig } from "vitest/config";

/** Vicenç's question bank (`pnpm eval:vicenc`), apart from the unit tests. */
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
      include: ["eval/**/*.eval.ts"],
      maxWorkers: 1,
    },
  };
});
