import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      includeAssets: ["icon.svg", "brand/icon-maskable.svg", "brand/wordmark.svg"],
      manifest: {
        name: "Va de Vi — private wine memory",
        short_name: "Va de Vi",
        description: "A private, collaborative wine memory and tasting companion.",
        theme_color: "#6b1220",
        background_color: "#fbe9e5",
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
