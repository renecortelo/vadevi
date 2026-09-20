import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { parse } from "dotenv";

import { validateEnvironment, wranglerVars } from "./environment";
import { parseJsonc } from "./jsonc";

/**
 * `pnpm validate:env` checks a developer's `.env.local` and `.dev.vars` over
 * the process environment. `pnpm validate:env --config <wrangler.jsonc>`
 * checks the `vars` a deployment will ship instead — the same check the
 * deploy script runs first.
 */
const root = process.cwd();

function readOptionalEnv(fileName: string): Record<string, string> {
  const path = resolve(root, fileName);
  return existsSync(path) ? parse(readFileSync(path)) : {};
}

const configFlag = process.argv.indexOf("--config");
const configPath = configFlag === -1 ? null : (process.argv[configFlag + 1] ?? null);

let values: Record<string, unknown>;
let source: string;
if (configPath === null) {
  values = { ...process.env, ...readOptionalEnv(".env.local"), ...readOptionalEnv(".dev.vars") };
  source = "the environment and .dev.vars";
} else {
  const path = resolve(root, configPath);
  if (!existsSync(path)) {
    console.error(`validate-env: ${configPath} does not exist.`);
    process.exit(1);
  }
  values = wranglerVars(parseJsonc(readFileSync(path, "utf8")));
  source = `the vars of ${configPath}`;
}

const result = validateEnvironment(values);
if (!result.ok) {
  console.error(`Invalid settings in ${source}:\n${result.message}`);
  process.exitCode = 1;
} else {
  console.info(
    `Settings in ${source} are valid (${result.value.APP_ENV}, AI provider: ${result.value.AI_PROVIDER}, access: ${result.value.ACCESS_MODE}).`,
  );
}
