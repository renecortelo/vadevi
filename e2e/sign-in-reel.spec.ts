import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./fixtures/server";

/**
 * The sign-in screen's reel: what Va de Vi is for, in under twenty seconds.
 * Its figures are the library's own; it can be paused, every animation at
 * once; «Get started» leads to the sign-in button; it fits a phone; and with
 * reduced motion it is its last frame, still.
 */
const names = (JSON.parse(readFileSync(resolve("data/kb/appellations.json"), "utf8")) as unknown[])
  .length;
const grapes = (JSON.parse(readFileSync(resolve("data/kb/grapes.json"), "utf8")) as unknown[])
  .length;
const english = new Intl.NumberFormat("en");

/** Every animation of the reel, CSS and scripted, at one moment, paused. */
const seek = (time: number) => {
  for (const animation of document.querySelector(".reel")!.getAnimations({ subtree: true })) {
    animation.pause();
    animation.currentTime = time * 1000;
  }
};

test("the sign-in reel tells what the app is for, from the library's own figures", async ({
  page,
}) => {
  await page.goto("/");
  const reel = page.locator(".reel");
  await expect(reel).toBeVisible({ timeout: 15_000 });
  await expect(reel.locator(".sr-only")).toContainText(english.format(names));
  await expect(reel.locator(".sr-only")).toContainText(String(grapes));

  // Paused, every animation of it stands still.
  await reel.getByRole("button", { name: "Pause the animation" }).click();
  const states = await reel.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      // A button's colour easing on hover is a transition, not the reel.
      .filter((animation) => !(animation instanceof CSSTransition))
      .map((animation) => animation.playState),
  );
  expect(states.length).toBeGreaterThan(10);
  expect(states.every((state) => state === "paused")).toBe(true);

  // At its end, «Get started» leads to the sign-in button.
  await page.evaluate(seek, 19);
  await reel.getByRole("button", { name: "Get started" }).click();
  await expect(page.getByRole("button", { name: /Google/ })).toBeFocused();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
});

test("the reel fits a phone, and stands still for reduced motion", async ({ page }) => {
  await page.setViewportSize({ height: 720, width: 320 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reel = page.locator(".reel");
  await expect(reel).toHaveClass(/reel--still/, { timeout: 15_000 });
  await expect(reel.locator(".reel-shot--close")).toBeVisible();
  await expect(reel.locator(".reel-shot--close .reel-figures")).toContainText(
    english.format(names),
  );
  await expect(reel.getByRole("button", { name: "Pause the animation" })).toHaveCount(0);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
