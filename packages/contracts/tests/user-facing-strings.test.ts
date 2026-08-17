import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Anything the server sends for a person to read is a code, not a sentence.
 *
 * The identification response once carried `warnings: z.array(z.string())`, and
 * the server filled it with English prose that went straight to the screen — so
 * a Spanish interface read an English apology, and one of those sentences
 * repeated a line the client had already shown in the reader's own language.
 *
 * Every other warning field in these contracts was already an enum. That is the
 * pattern; this is what keeps the next one from being written the other way,
 * because nothing about `z.array(z.string())` looks wrong on the day it is
 * typed.
 */
const sourceDirectory = resolve(import.meta.dirname, "../src");

function sources(): { name: string; text: string }[] {
  return readdirSync(sourceDirectory)
    .filter((name) => name.endsWith(".ts"))
    .map((name) => ({ name, text: readFileSync(join(sourceDirectory, name), "utf8") }));
}

describe("strings the server sends for a person to read", () => {
  it("declares every warning field as a code, never as free text", () => {
    const offenders: string[] = [];
    for (const { name, text } of sources()) {
      for (const match of text.matchAll(/warnings:\s*z\s*\n?\s*\.?\s*array\(\s*([^)]*)/g)) {
        const inner = (match[1] ?? "").trim();
        // A schema reference (…WarningSchema) or an inline z.enum both name a
        // closed set. A bare string does not.
        const closed = inner.includes("z.enum") || /Schema$/.test(inner.replace(/[,\s]+$/, ""));
        if (!closed) offenders.push(`${name}: warnings: z.array(${inner.slice(0, 40)}…)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
