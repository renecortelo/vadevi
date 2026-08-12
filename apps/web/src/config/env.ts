import { z } from "zod";

const WebEnvironmentSchema = z.object({
  apiBaseUrl: z.string().startsWith("/").default("/api/v1"),
  firebaseUseEmulator: z.boolean().default(true),
});

export const webEnvironment = WebEnvironmentSchema.parse({
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? "/api/v1",
  firebaseUseEmulator: import.meta.env.VITE_FIREBASE_USE_EMULATOR !== "false",
});
