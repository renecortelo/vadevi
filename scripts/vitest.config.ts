import { dirname, resolve } from "node:path";

import { defineConfig } from "vitest/config";

/** The scripts' own tests: the readers and validators the deploy relies on. */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/**/*.test.ts"],
    root: resolve(dirname(new URL(import.meta.url).pathname), ".."),
  },
});
