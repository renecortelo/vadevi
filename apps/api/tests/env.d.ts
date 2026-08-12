import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare global {
  namespace Cloudflare {
    interface Env {
      APP_ENV: "local";
      APP_VERSION: string;
      AI_PROVIDER: "none";
      FIREBASE_AUTH_EMULATOR_HOST: string;
      FIREBASE_PROJECT_ID: string;
      DB: D1Database;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
