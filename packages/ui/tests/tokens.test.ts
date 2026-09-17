import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every custom property that is used is also defined.
 *
 * A `var(--typo)` with no definition makes the whole declaration invalid at
 * computed-value time, so the property silently falls back to its initial
 * value. `--space-8` was never defined, which meant `padding: clamp(…,
 * var(--space-8))` computed to **zero** — the cellar, wishlist and price cards
 * had their contents flush against their own borders, and nothing failed.
 *
 * That is the whole class: a stylesheet does not error, it just quietly does
 * something else.
 */
const stylesheets = [
  resolve(import.meta.dirname, "../src/styles/tokens.css"),
  resolve(import.meta.dirname, "../../../apps/web/src/styles/global.css"),
];

function read(paths: string[]): string {
  return paths.map((path) => readFileSync(path, "utf8")).join("\n");
}

describe("custom properties", () => {
  const css = read(stylesheets);
  const defined = new Set([...css.matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)].map((m) => m[1]));

  it("defines every token any stylesheet reads", () => {
    const missing = new Set<string>();
    // A `var(--x, fallback)` still counts as a use: relying on the fallback is
    // how the missing token went unnoticed for as long as it did.
    for (const match of css.matchAll(/var\(\s*(--[a-z0-9-]+)/g)) {
      const token = match[1];
      if (token !== undefined && !defined.has(token)) missing.add(token);
    }
    expect([...missing]).toEqual([]);
  });

  it("defines every colour token in both palettes", () => {
    const light = css.slice(0, css.indexOf("@media"));
    const dark = css.slice(css.indexOf('[data-theme="dark"]'));
    const missing: string[] = [];
    for (const match of light.matchAll(/^\s*(--color-[a-z0-9-]+)\s*:/gm)) {
      const token = match[1];
      if (token !== undefined && !new RegExp(`${token}\\s*:`).test(dark)) missing.push(token);
    }
    // A colour defined only in one palette keeps the other palette's value,
    // which is how a light surface survived into a dark page once already.
    expect(missing).toEqual([]);
  });
});
