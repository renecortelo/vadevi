import type { D1Migration } from "@cloudflare/vitest-pool-workers";

declare global {
  namespace Cloudflare {
    interface Env {
      APP_ENV: "local";
      APP_VERSION: string;
      AI_PROVIDER: "none";
      FIREBASE_AUTH_EMULATOR_HOST: string;
      FIREBASE_AUTH_DOMAIN: string;
      FIREBASE_PROJECT_ID: string;
      FIREBASE_WEB_API_KEY: string;
      EXTERNAL_API_USER_AGENT: string;
      RESEARCH_PROVIDER: "none";
      DB: D1Database;
      MEDIA: R2Bucket;
      TEST_MIGRATIONS: D1Migration[];
    }
  }
}

export {};
