import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

import { libraryFiguresPlugin } from "./library-figures.ts";

export default defineConfig({
  plugins: [react(), libraryFiguresPlugin()],
  resolve: {
    alias: {
      "virtual:pwa-register/react": resolve(import.meta.dirname, "src/tests/pwa-register.mock.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    maxWorkers: 1,
    pool: "threads",
  },
});
