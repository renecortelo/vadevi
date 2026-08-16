import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Keyboard behaviour, which axe cannot check.
 *
 * axe inspects the properties an element declares. Whether focus actually goes
 * anywhere useful, stays where it was promised, and comes back afterwards is
 * behaviour, and only driving the keyboard tests it.
 */
async function openConfirmDialog(page: Page) {
  await page.goto("/log/new");
  await page
    .getByLabel(/producer/i)
    .first()
    .fill("Celler Sintètic");
  await page
    .getByLabel(/wine name/i)
    .first()
    .fill("Vinya de Mostra");
  await page.getByRole("button", { name: /review/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

/** What the browser says has focus, as a short readable label. */
async function focused(page: Page): Promise<string> {
  return page.evaluate(() => {
    const element = document.activeElement;
    if (element === null) return "none";
    const inDialog = element.closest('[role="dialog"]') !== null;
    const label = element.textContent?.trim().slice(0, 30) ?? "";
    return `${inDialog ? "inside" : "OUTSIDE"}:${element.tagName.toLowerCase()}:${label}`;
  });
}

test.describe("keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
  });

  test("moves focus into the confirmation dialog when it opens", async ({ page }) => {
    await openConfirmDialog(page);
    // A dialog that opens without taking focus leaves a keyboard user reading a
    // page they cannot reach, and a screen-reader user hearing nothing at all.
    expect(await focused(page)).toContain("inside");
  });

  test("keeps focus inside the dialog while it is open", async ({ page }) => {
    await openConfirmDialog(page);
    // `aria-modal="true"` tells assistive technology everything outside is
    // inert. If Tab can still leave, focus lands somewhere the screen reader
    // has been told to ignore, and the user is stranded.
    for (let step = 0; step < 12; step += 1) {
      await page.keyboard.press("Tab");
      expect(await focused(page), `after ${step + 1} tabs`).toContain("inside");
    }
  });

  test("closes on Escape and gives focus back", async ({ page }) => {
    await openConfirmDialog(page);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    // Returning focus to the control that opened it is what lets someone carry
    // on from where they were rather than from the top of the document.
    expect(await focused(page)).toMatch(/button/i);
  });

  test("reaches the main content with the skip link, from the very first Tab", async ({ page }) => {
    await page.goto("/memory");
    await page.waitForLoadState("networkidle");

    // The skip link only earns its place if it is the first thing a keyboard
    // reaches and it actually moves focus, rather than only scrolling.
    await page.keyboard.press("Tab");
    const firstStop = await focused(page);
    expect(firstStop).toContain("a:");

    await page.keyboard.press("Enter");
    const landed = await page.evaluate(() => document.activeElement?.id ?? "");
    expect(landed).toBe("main-content");
  });

  test("can walk from the first Tab to a main action without a mouse", async ({ page }) => {
    await page.goto("/memory");
    await page.waitForLoadState("networkidle");

    // Every stop must be something a person can see. A control that takes focus
    // while invisible is a hole a keyboard user falls into silently.
    const invisible: string[] = [];
    for (let step = 0; step < 25; step += 1) {
      await page.keyboard.press("Tab");
      const stop = await page.evaluate(() => {
        const element = document.activeElement;
        if (!(element instanceof HTMLElement) || element === document.body) return null;
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const hidden =
          style.visibility === "hidden" ||
          style.display === "none" ||
          (box.width === 0 && box.height === 0);
        return hidden
          ? `${element.tagName.toLowerCase()}#${element.id}.${element.className}`
          : null;
      });
      if (stop !== null) invisible.push(`step ${step + 1}: ${stop}`.slice(0, 110));
    }
    expect(invisible).toEqual([]);
  });
});
