import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

import { libraryFiguresPlugin } from "./library-figures.ts";

// zod's `z` namespace, which @hono/zod-openapi extends as a whole, re-exports
// every one of zod's 49 message locales; the app sets none and zod defaults to
// English, so the browser bundle gets English alone.
const zodEnglishOnly: Plugin = {
  enforce: "pre",
  load(id) {
    return id === "\0zod-locales-en"
      ? `export { default as en } from ${JSON.stringify(zodLocale)};`
      : null;
  },
  name: "zod-english-only",
  resolveId(source, importer) {
    return source === "../locales/index.js" &&
      importer !== undefined &&
      /[\\/]zod[\\/]v4[\\/]/.test(importer)
      ? "\0zod-locales-en"
      : null;
  },
};
const zodLocale = createRequire(import.meta.url).resolve("zod/v4/locales/en.js");

export default defineConfig({
  plugins: [
    zodEnglishOnly,
    react(),
    // The library's figures, counted from data/kb at build (the sign-in reel).
    libraryFiguresPlugin(),
    VitePWA({
      registerType: "prompt",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: [
        "icon.svg",
        "boot.css",
        "theme-init.js",
        "brand/icon-maskable.svg",
        "brand/icon-light.svg",
        "brand/lockup-dark.svg",
        "brand/lockup-light.svg",
      ],
      manifest: {
        name: "Va de Vi — private wine memory",
        short_name: "Va de Vi",
        description: "A private, collaborative wine memory and tasting companion.",
        theme_color: "#8b1116",
        background_color: "#fbeee5",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          {
            src: "/icon.svg",
            sizes: "192x192",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/icon.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "any",
          },
          {
            src: "/brand/icon-maskable.svg",
            sizes: "512x512",
            type: "image/svg+xml",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{css,html,js,svg,webmanifest}"],
      },
    }),
  ],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8787",
      "/health": "http://localhost:8787",
      "/openapi.json": "http://localhost:8787",
      "/runtime-config": "http://localhost:8787",
    },
  },
});
