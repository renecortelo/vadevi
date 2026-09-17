import { z } from "zod";

const WebEnvironmentSchema = z.object({
  apiBaseUrl: z.string().startsWith("/").default("/api/v1"),
  firebaseApiKey: z.string().min(1),
  firebaseAuthDomain: z.string().min(1),
  firebaseAuthEmulatorHost: z.string().min(1),
  firebaseProjectId: z.string().min(1),
  firebaseUseEmulator: z.boolean().default(true),
  /**
   * AGPL-3.0 §13 obliges an operator to offer the Corresponding Source to users
   * who interact with the application over a network. A deployment points this
   * at its own source so the offer is real rather than decorative.
   */
  sourceUrl: z.string().url(),
});

export const webEnvironment = WebEnvironmentSchema.parse({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "local-emulator-placeholder",
  firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "localhost",
  firebaseAuthEmulatorHost: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
  firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-vadevi",
  firebaseUseEmulator: import.meta.env.VITE_FIREBASE_USE_EMULATOR !== "false",
  sourceUrl: import.meta.env.VITE_SOURCE_URL ?? "https://github.com/renecortelo/vadevi",
});
