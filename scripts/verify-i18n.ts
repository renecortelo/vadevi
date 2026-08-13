import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { tastingDescriptors } from "../packages/i18n/src/ontology";

const locales = ["ca", "es", "fr", "en", "it", "pt-PT", "nl", "de"] as const;
const source = JSON.parse(
  await readFile(resolve("packages/i18n/src/locales/en/common.json"), "utf8"),
) as unknown;

function flatten(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}

const expectedKeys = flatten(source).sort();
let failed = false;

for (const locale of locales) {
  const catalogPath = resolve(`packages/i18n/src/locales/${locale}/common.json`);
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as unknown;
  const actualKeys = flatten(catalog).sort();
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const extra = actualKeys.filter((key) => !expectedKeys.includes(key));

  if (missing.length > 0 || extra.length > 0) {
    failed = true;
    console.error(`${locale}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
  }
}

const descriptorCodes = new Set<string>();
for (const descriptor of tastingDescriptors) {
  if (descriptorCodes.has(descriptor.code)) {
    failed = true;
    console.error(`Duplicate tasting descriptor code: ${descriptor.code}`);
  }
  descriptorCodes.add(descriptor.code);
  for (const locale of locales) {
    const text = descriptor.text[locale];
    if (text.label.trim().length === 0 || text.help.trim().length === 0) {
      failed = true;
      console.error(`${descriptor.code}: missing ${locale} label or help text`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.info(
    `All ${locales.length} catalogs match the English source keys and ${tastingDescriptors.length} ontology descriptors are localized.`,
  );
}
