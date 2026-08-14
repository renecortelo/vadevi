import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";
import { z } from "zod";

const root = process.cwd();

function readOptionalEnv(fileName: string): Record<string, string> {
  const path = resolve(root, fileName);
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

const fileEnvironment = {
  ...readOptionalEnv(".env.local"),
  ...readOptionalEnv(".dev.vars"),
};

const EnvironmentSchema = z
  .object({
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
    RESEARCH_PROVIDER: z.enum(["none", "open_data"]).default("none"),
    VITE_API_BASE_URL: z.string().startsWith("/").default("/api/v1"),
    VITE_FIREBASE_USE_EMULATOR: z.enum(["true", "false"]).default("true"),
  })
  .superRefine((environment, context) => {
    if (environment.AI_PROVIDER === "cloudflare" && environment.AI_MODEL === undefined) {
      context.addIssue({
        code: "custom",
        message: "Cloudflare AI requires an explicit @cf/* model allowlist entry.",
        path: ["AI_MODEL"],
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

const result = EnvironmentSchema.safeParse({ ...process.env, ...fileEnvironment });

if (!result.success) {
  console.error(z.prettifyError(result.error));
  process.exitCode = 1;
} else {
  console.info(
    `Environment is valid (${result.data.APP_ENV}, AI provider: ${result.data.AI_PROVIDER}).`,
  );
}
