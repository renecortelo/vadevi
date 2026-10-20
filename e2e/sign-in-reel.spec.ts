import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./fixtures/server";

/**
 * The sign-in card's reel: what Va de Vi is for, in under twenty seconds,
 * told with the logo's own bottles and ending on the logo just above
 * «Continue with Google», in the same card. Its figures are the library's
 * own; it loops, and its one control pauses every animation at once; it fits
 * a phone; and with reduced motion it is its last frame, still.
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

  // Told with the logo's own bottles: one for the opening and each of the six
  // steps gathers in the row, and at the close all seven carry the word.
  await expect(reel.locator(".reel__slot")).toHaveCount(7);
  await expect(reel.locator(".reel-lockup__bottle")).toHaveCount(7);
  await expect(reel.locator(".reel-lockup .reel-letter")).toHaveCount(10);

  // One card: the reel and the sign-in button together, and no other control
  // than the pause.
  const card = page.locator(".access-card");
  await expect(card).toHaveCount(1);
  await expect(card.locator(".reel")).toHaveCount(1);
  await expect(card.getByRole("button", { name: /Google/ })).toBeVisible();
  await expect(reel.getByRole("button")).toHaveCount(1);

  // A loop: past the end of a pass, the reel begins again from its opening.
  const stage = await reel.locator(".reel__stage").elementHandle();
  await page.evaluate(() => {
    for (const animation of document.querySelector(".reel")!.getAnimations({ subtree: true })) {
      animation.currentTime = 19_700;
      animation.play();
    }
  });
  await expect
    .poll(() => reel.locator(".reel__stage").evaluate((element, old) => element !== old, stage))
    .toBe(true);
  await page.evaluate(seek, 19);

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
