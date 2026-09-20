import { z } from "zod";

/**
 * What a deployment's settings must look like, wherever they come from.
 *
 * One schema for the three places settings live: `.dev.vars` and `.env.local`
 * for a developer's machine (`pnpm validate:env`), and the `vars` block of a
 * Wrangler configuration for a deployment (`pnpm validate:env --config
 * wrangler.preview.jsonc`, and the deploy script before it touches anything
 * remote). The deploy used to ship whatever the file said; a typo in
 * ACCESS_MODE reached the Worker, where it meant "open".
 */
const EnvironmentSchema = z
  .object({
    ACCESS_ADMIN_AUD: z
      .string()
      .regex(/^[a-f0-9]{64}$/, "ACCESS_ADMIN_AUD is the Access application's 64-hex audience tag.")
      .optional(),
    ACCESS_MODE: z.enum(["open", "allowlist"]).default("open"),
    ACCESS_TEAM_DOMAIN: z
      .string()
      .regex(
        /^[a-z0-9][a-z0-9-]{0,62}$/,
        "ACCESS_TEAM_DOMAIN is the <team> of <team>.cloudflareaccess.com.",
      )
      .optional(),
    ADMIN_EMAILS: z
      .string()
      .default("")
      .refine(
        (value) =>
          value
            .split(",")
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
            .every((entry) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(entry)),
        "ADMIN_EMAILS must be comma-separated e-mail addresses.",
      ),
    APP_ENV: z.enum(["local", "preview", "production"]).default("local"),
    APP_VERSION: z
      .string()
      .regex(/^\d+\.\d+\.\d+(?:-[a-z0-9.-]+)?$/i)
      .default("0.1.0"),
    AI_PROVIDER: z.enum(["none", "cloudflare"]).default("none"),
    AI_MODEL: z
      .string()
      .regex(/^@cf\/[a-z0-9][a-z0-9._/-]{2,119}$/)
      .optional(),
    AI_OCR_MODEL: z
      .string()
      .regex(/^@cf\/[a-z0-9][a-z0-9._/-]{2,119}$/)
      .optional(),
    EXTERNAL_API_USER_AGENT: z.string().min(16).max(300).optional(),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().optional(),
    FIREBASE_AUTH_DOMAIN: z.string().min(1).default("localhost"),
    FIREBASE_AUTH_PROXY: z.enum(["true", "false"]).default("false"),
    FIREBASE_PROJECT_ID: z.string().min(1).default("demo-vadevi"),
    FIREBASE_WEB_API_KEY: z.string().min(1).default("local-emulator-placeholder"),
    MAP_TILES_PROVIDER: z.enum(["none", "openstreetmap"]).default("none"),
    PLACES_PROVIDER: z.enum(["none", "openstreetmap"]).default("none"),
    RESEARCH_PROVIDER: z.enum(["none", "open_data"]).default("none"),
    VITE_API_BASE_URL: z.string().startsWith("/").default("/api/v1"),
    VITE_FIREBASE_USE_EMULATOR: z.enum(["true", "false"]).default("true"),
  })
  .superRefine((environment, context) => {
    // A private door with nobody to keep it is a door nobody can ever open:
    // the list starts empty and only an administrator can add to it.
    if (environment.ACCESS_MODE === "allowlist" && environment.ADMIN_EMAILS.trim().length === 0) {
      context.addIssue({
        code: "custom",
        message: "ACCESS_MODE=allowlist needs at least one administrator in ADMIN_EMAILS.",
        path: ["ADMIN_EMAILS"],
      });
    }

    // The second door needs both halves: the team that signs the JWT and the
    // application it is for. One without the other silently guards nothing.
    if (
      (environment.ACCESS_TEAM_DOMAIN === undefined) !==
      (environment.ACCESS_ADMIN_AUD === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "ACCESS_TEAM_DOMAIN and ACCESS_ADMIN_AUD go together; set both or neither.",
        path: ["ACCESS_TEAM_DOMAIN"],
      });
    }

    if (environment.AI_PROVIDER === "cloudflare" && environment.AI_MODEL === undefined) {
      context.addIssue({
        code: "custom",
        message: "Cloudflare AI requires an explicit @cf/* model allowlist entry.",
        path: ["AI_MODEL"],
      });
    }

    // Nominatim's usage policy requires an identifying agent with a contact, the
    // same one open-data research needs — so venue lookup demands it too, even
    // where research itself is off.
    if (
      environment.MAP_TILES_PROVIDER === "openstreetmap" &&
      (environment.EXTERNAL_API_USER_AGENT === undefined ||
        !/VaDeVi\//.test(environment.EXTERNAL_API_USER_AGENT) ||
        !/https:\/\//.test(environment.EXTERNAL_API_USER_AGENT))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "OpenStreetMap map tiles require an identifying VaDeVi/* user agent with HTTPS contact.",
        path: ["EXTERNAL_API_USER_AGENT"],
      });
    }

    if (
      environment.PLACES_PROVIDER === "openstreetmap" &&
      (environment.EXTERNAL_API_USER_AGENT === undefined ||
        !/VaDeVi\//.test(environment.EXTERNAL_API_USER_AGENT) ||
        !/https:\/\//.test(environment.EXTERNAL_API_USER_AGENT))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "OpenStreetMap venue lookup requires an identifying VaDeVi/* user agent with HTTPS contact.",
        path: ["EXTERNAL_API_USER_AGENT"],
      });
    }

    if (
      environment.RESEARCH_PROVIDER === "open_data" &&
      (environment.EXTERNAL_API_USER_AGENT === undefined ||
        !/VaDeVi\//.test(environment.EXTERNAL_API_USER_AGENT) ||
        !/https:\/\//.test(environment.EXTERNAL_API_USER_AGENT) ||
        environment.EXTERNAL_API_USER_AGENT.includes("\r") ||
        environment.EXTERNAL_API_USER_AGENT.includes("\n"))
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Open-data research requires an identifying VaDeVi/* user agent with HTTPS contact.",
        path: ["EXTERNAL_API_USER_AGENT"],
      });
    }

    if (
      environment.FIREBASE_AUTH_PROXY === "true" &&
      !/\.(firebaseapp\.com|web\.app)$/i.test(environment.FIREBASE_AUTH_DOMAIN)
    ) {
      context.addIssue({
        code: "custom",
        message:
          "The auth handler proxy only forwards to a Firebase-issued auth domain (*.firebaseapp.com or *.web.app).",
        path: ["FIREBASE_AUTH_PROXY"],
      });
    }

    if (environment.APP_ENV === "local" && !environment.FIREBASE_PROJECT_ID.startsWith("demo-")) {
      context.addIssue({
        code: "custom",
        message: "Local Firebase project IDs must use the non-production demo-* namespace.",
        path: ["FIREBASE_PROJECT_ID"],
      });
    }

    if (
      environment.APP_ENV !== "local" &&
      environment.FIREBASE_AUTH_EMULATOR_HOST !== undefined &&
      environment.FIREBASE_AUTH_EMULATOR_HOST.length > 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Preview and production must not configure the Firebase Auth Emulator host.",
        path: ["FIREBASE_AUTH_EMULATOR_HOST"],
      });
    }

    if (environment.APP_ENV !== "local" && environment.VITE_FIREBASE_USE_EMULATOR === "true") {
      context.addIssue({
        code: "custom",
        message: "Preview and production cannot use the Firebase emulator.",
        path: ["VITE_FIREBASE_USE_EMULATOR"],
      });
    }
  });

export type ValidatedEnvironment = z.infer<typeof EnvironmentSchema>;

export function validateEnvironment(
  values: Record<string, unknown>,
): { ok: true; value: ValidatedEnvironment } | { ok: false; message: string } {
  const result = EnvironmentSchema.safeParse(values);
  return result.success
    ? { ok: true, value: result.data }
    : { ok: false, message: z.prettifyError(result.error) };
}

/**
 * The `vars` of a Wrangler configuration, as the Worker will see them. The
 * VITE_* settings are the web build's and never appear in `vars`; they are
 * filled in from APP_ENV so the rules that mention them can still run.
 */
export function wranglerVars(configuration: unknown): Record<string, unknown> {
  const vars =
    typeof configuration === "object" && configuration !== null && "vars" in configuration
      ? (configuration as { vars?: unknown }).vars
      : undefined;
  if (typeof vars !== "object" || vars === null) {
    throw new Error("The configuration has no vars block.");
  }
  const appEnvironment = (vars as { APP_ENV?: unknown }).APP_ENV;
  return {
    VITE_FIREBASE_USE_EMULATOR: appEnvironment === "local" ? "true" : "false",
    ...(vars as Record<string, unknown>),
  };
}
