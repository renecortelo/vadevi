import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import { createApi } from "../apps/api/src/app";

const outputPath = resolve("packages/contracts/openapi/openapi.json");
const document = createApi().getOpenAPIDocument({
  openapi: "3.1.0",
  info: {
    title: "Va de Vi API",
    version: "0.1.0",
    description: "Space-scoped API contracts for the private Va de Vi application.",
  },
});
const generated = `${JSON.stringify(document, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const existing = await readFile(outputPath, "utf8").catch(() => "");
  if (existing !== generated) {
    console.error("Generated OpenAPI is stale. Run `pnpm openapi:generate`.");
    process.exitCode = 1;
  } else {
    console.info("Generated OpenAPI is current.");
  }
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, "utf8");
  console.info(`Wrote ${outputPath}`);
}
