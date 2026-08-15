import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Contrast guard for the brand palette.
 *
 * §18.3 makes a serious accessibility violation a release blocker, and a colour
 * change is the easiest way to introduce one without noticing. These pairs are
 * the ones the interface actually renders, so they are pinned here rather than
 * left to a reviewer's eye.
 */
const tokens = readFileSync(resolve(import.meta.dirname, "../src/styles/tokens.css"), "utf8");

/** The explicit dark block; the media-query block declares the same values. */
const darkBlock = tokens.slice(tokens.indexOf(':root[data-theme="dark"]'));

function token(name: string, theme: "dark" | "light" = "light"): string {
  const source = theme === "dark" ? darkBlock : tokens.slice(0, tokens.indexOf("@media"));
  const value = source.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
  if (value === undefined) {
    throw new Error(`Token --${name} is missing from the ${theme} palette.`);
  }
  return value;
}

function channel(value: number): number {
  const ratio = value / 255;
  return ratio <= 0.040_45 ? ratio / 12.92 : ((ratio + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

export function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Pairs the interface renders as body text. */
const bodyTextPairs: [string, string, string][] = [
  ["body text on canvas", "color-text", "color-canvas"],
  ["body text on raised surface", "color-text", "color-surface-raised"],
  ["muted text on canvas", "color-text-muted", "color-canvas"],
  ["muted text on raised surface", "color-text-muted", "color-surface-raised"],
  ["accent text on canvas", "color-accent", "color-canvas"],
  ["text on accent fill", "color-on-accent", "color-accent"],
  ["text on strong accent fill", "color-on-accent", "color-accent-strong"],
  ["text on plum fill", "color-on-accent", "color-plum"],
  ["focus indicator on canvas", "color-focus", "color-canvas"],
  ["success text on canvas", "color-success", "color-canvas"],
  ["warning text on canvas", "color-warning", "color-canvas"],
];

describe.each(["light", "dark"] as const)("%s palette contrast", (theme) => {
  for (const [label, foreground, background] of bodyTextPairs) {
    it(`${label} meets WCAG AA for body text`, () => {
      const ratio = contrastRatio(token(foreground, theme), token(background, theme));
      expect(ratio, `${label} is ${ratio.toFixed(2)}:1 in ${theme}`).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("declares every colour token the light palette declares", () => {
    // A token missing from one palette would silently fall back to the other,
    // which is how a dark theme ends up with an unreadable patch.
    for (const [, foreground, background] of bodyTextPairs) {
      expect(() => token(foreground, theme)).not.toThrow();
      expect(() => token(background, theme)).not.toThrow();
    }
  });
});

describe("brand palette", () => {
  it("keeps the border visible against both canvas and raised surfaces", () => {
    // A border is a non-text element, so 3:1 is the applicable threshold.
    for (const background of ["color-canvas", "color-surface-raised"]) {
      const ratio = contrastRatio(token("color-border"), token(background));
      expect(ratio, `border on ${background} is ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(1.2);
    }
  });

  it("declares the decorative bottle tints separately from text colours", () => {
    // These fills sit behind content and must never be used for text, so they
    // are deliberately not held to a text contrast ratio.
    for (const name of ["color-bottle-1", "color-bottle-2", "color-bottle-3"]) {
      expect(token(name)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});
