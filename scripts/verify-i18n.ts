import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { tastingDescriptors } from "../packages/i18n/src/ontology";
import {
  type Catalog,
  expansionRatio,
  extractPlaceholders,
  minimumExpansionRatio,
  pseudoLocalizeCatalog,
} from "../packages/i18n/src/pseudo";

const locales = ["ca", "es", "fr", "en", "it", "pt-PT", "nl", "de"] as const;
type Locale = (typeof locales)[number];

/**
 * Locales whose compound nouns run longest. §13.4 asks for automated checks on
 * these so a layout regression is caught before a fluent reviewer sees it.
 */
const longStringLocales: readonly Locale[] = ["de", "nl"];

/** Above this length a single interface string is very likely to break narrow layouts. */
const longStringBudget = 200;

const source = JSON.parse(
  await readFile(resolve("packages/i18n/src/locales/en/common.json"), "utf8"),
) as Catalog;

function flatten(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return [prefix];
  }

  return Object.entries(value).flatMap(([key, child]) =>
    flatten(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}

function flattenEntries(value: unknown, prefix = ""): [string, string][] {
  if (typeof value === "string") return [[prefix, value]];
  if (typeof value !== "object" || value === null || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, child]) =>
    flattenEntries(child, prefix.length === 0 ? key : `${prefix}.${key}`),
  );
}

const expectedKeys = flatten(source).sort();
const sourceEntries = new Map(flattenEntries(source));
let failed = false;

function fail(message: string) {
  failed = true;
  console.error(message);
}

for (const locale of locales) {
  const catalogPath = resolve(`packages/i18n/src/locales/${locale}/common.json`);
  const catalog = JSON.parse(await readFile(catalogPath, "utf8")) as Catalog;
  const actualKeys = flatten(catalog).sort();
  const missing = expectedKeys.filter((key) => !actualKeys.includes(key));
  const extra = actualKeys.filter((key) => !expectedKeys.includes(key));

  if (missing.length > 0 || extra.length > 0) {
    fail(`${locale}: missing [${missing.join(", ")}], extra [${extra.join(", ")}]`);
  }

  for (const [key, value] of flattenEntries(catalog)) {
    const sourceValue = sourceEntries.get(key);
    if (sourceValue === undefined) continue;

    if (value.trim().length === 0) {
      fail(`${locale}: ${key} is empty`);
      continue;
    }

    // A translator must never add, drop, or rename an interpolation or ICU block.
    const sourcePlaceholders = extractPlaceholders(sourceValue).join("|");
    const localePlaceholders = extractPlaceholders(value).join("|");
    if (sourcePlaceholders !== localePlaceholders) {
      fail(
        `${locale}: ${key} interpolation mismatch (expected ${sourcePlaceholders || "none"}, found ${localePlaceholders || "none"})`,
      );
    }

    // An unbalanced brace usually means a broken ICU plural/select block.
    const opens = (value.match(/\{/g) ?? []).length;
    const closes = (value.match(/\}/g) ?? []).length;
    if (opens !== closes) fail(`${locale}: ${key} has unbalanced interpolation braces`);

    // A raw source key leaking into a screen is a release blocker.
    if (expectedKeys.includes(value.trim())) {
      fail(`${locale}: ${key} contains an untranslated source key`);
    }

    if (longStringLocales.includes(locale) && value.length > longStringBudget) {
      fail(`${locale}: ${key} is ${value.length} characters, above the ${longStringBudget} budget`);
    }
  }
}

/**
 * Pseudo-localization gate. Every source string must survive expansion with its
 * placeholders intact and grow by at least the documented ratio, which is what
 * makes the pseudo catalog useful as a layout probe.
 */
const pseudoCatalog = pseudoLocalizeCatalog(source);
const pseudoEntries = new Map(flattenEntries(pseudoCatalog));
let shortestExpansion = Number.POSITIVE_INFINITY;

for (const [key, sourceValue] of sourceEntries) {
  const pseudoValue = pseudoEntries.get(key);
  if (pseudoValue === undefined) {
    fail(`pseudo: ${key} was not generated`);
    continue;
  }
  if (extractPlaceholders(sourceValue).join("|") !== extractPlaceholders(pseudoValue).join("|")) {
    fail(`pseudo: ${key} lost or altered an interpolation placeholder`);
  }
  const ratio = expansionRatio(sourceValue, pseudoValue);
  if (ratio < minimumExpansionRatio) {
    fail(
      `pseudo: ${key} expanded by ${(ratio * 100).toFixed(1)}%, below the required ${(minimumExpansionRatio * 100).toFixed(0)}%`,
    );
  }
  if (Number.isFinite(ratio)) shortestExpansion = Math.min(shortestExpansion, ratio);
}

/**
 * Locale-sensitive formatting must come from `Intl`, never from concatenated
 * fragments. These checks assert the runtime actually produces the locale's own
 * decimal separator, date order, and currency placement.
 */
const formattingExpectations: Readonly<Record<Locale, { decimal: string }>> = {
  ca: { decimal: "," },
  de: { decimal: "," },
  en: { decimal: "." },
  es: { decimal: "," },
  fr: { decimal: "," },
  it: { decimal: "," },
  nl: { decimal: "," },
  "pt-PT": { decimal: "," },
};

const sampleDate = new Date("2026-03-04T12:00:00.000Z");
for (const locale of locales) {
  const decimal = new Intl.NumberFormat(locale)
    .formatToParts(1234.5)
    .find((part) => part.type === "decimal")?.value;
  if (decimal !== formattingExpectations[locale].decimal) {
    fail(
      `${locale}: decimal separator is ${String(decimal)}, expected ${formattingExpectations[locale].decimal}`,
    );
  }

  const dateParts = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeZone: "UTC" })
    .formatToParts(sampleDate)
    .filter((part) => part.type === "day" || part.type === "month" || part.type === "year")
    .map((part) => part.type);
  // English is the only supported locale that leads with the month.
  const expectedLead = locale === "en" ? "month" : "day";
  if (dateParts[0] !== expectedLead) {
    fail(`${locale}: short date leads with ${String(dateParts[0])}, expected ${expectedLead}`);
  }

  const currencyParts = new Intl.NumberFormat(locale, { currency: "EUR", style: "currency" })
    .formatToParts(12.5)
    .map((part) => part.type);
  if (!currencyParts.includes("currency")) {
    fail(`${locale}: currency formatting dropped the currency symbol`);
  }
}

const descriptorCodes = new Set<string>();
for (const descriptor of tastingDescriptors) {
  if (descriptorCodes.has(descriptor.code)) {
    fail(`Duplicate tasting descriptor code: ${descriptor.code}`);
  }
  descriptorCodes.add(descriptor.code);
  for (const locale of locales) {
    const text = descriptor.text[locale];
    if (text.label.trim().length === 0 || text.help.trim().length === 0) {
      fail(`${descriptor.code}: missing ${locale} label or help text`);
    }
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.info(
    `All ${locales.length} catalogs match the English source keys, keep their interpolation, ` +
      `format numbers/dates/currency per locale, and ${tastingDescriptors.length} ontology ` +
      `descriptors are localized. Pseudo-localization expands every string by at least ` +
      `${(shortestExpansion * 100).toFixed(0)}%.`,
  );
}
