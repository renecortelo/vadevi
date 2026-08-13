import { z } from "zod";

const WebEnvironmentSchema = z.object({
  apiBaseUrl: z.string().startsWith("/").default("/api/v1"),
  firebaseApiKey: z.string().min(1),
  firebaseAuthDomain: z.string().min(1),
  firebaseAuthEmulatorHost: z.string().min(1),
  firebaseProjectId: z.string().min(1),
  firebaseUseEmulator: z.boolean().default(true),
});

export const webEnvironment = WebEnvironmentSchema.parse({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  firebaseApiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? "local-emulator-placeholder",
  firebaseAuthDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? "localhost",
  firebaseAuthEmulatorHost: import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
  firebaseProjectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "demo-vadevi",
  firebaseUseEmulator: import.meta.env.VITE_FIREBASE_USE_EMULATOR !== "false",
});
