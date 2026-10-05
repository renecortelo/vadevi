import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "./fixtures/server";
import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Full-page screenshots of every screen, at a laptop and a phone width, in
 * both palettes — the contact sheet a design review works from.
 *
 * Not a test: nothing here asserts a pixel. It is skipped unless asked for,
 * because it takes a minute and writes forty images, and it lives in the e2e
 * suite only because that is where a signed-in browser with a seeded account
 * already exists. Run it with:
 *
 *   UX_SHOTS=1 pnpm exec playwright test e2e/ux-shots.spec.ts --project=chromium-desktop
 *
 * The images land in `.ux-shots/<theme>/<width>/<screen>.png`, which is
 * ignored by git.
 */
const enabled = process.env.UX_SHOTS === "1";
const outputRoot = resolve(import.meta.dirname, "../.ux-shots");

const widths = [
  { height: 900, name: "laptop", width: 1280 },
  { height: 844, name: "phone", width: 390 },
] as const;

test.describe("UX contact sheet", () => {
  test.skip(!enabled, "Set UX_SHOTS=1 to render the contact sheet.");
  test.setTimeout(240_000);

  for (const theme of ["light", "dark"] as const) {
    test(`renders every screen in the ${theme} palette`, async ({ browser }) => {
      for (const size of widths) {
        const context = await browser.newContext({
          colorScheme: theme,
          viewport: { height: size.height, width: size.width },
        });
        const page = await context.newPage();
        await signIn(page);
        await page.goto("/");
        await completeOnboarding(page);
        await page.goto("/about");
        await page.getByLabel(/^theme$/i).selectOption(theme);

        // One wine with a tasting, so the screens that need one have one.
        await page.goto("/log/new");
        await page.waitForLoadState("networkidle");
        await page
          .getByLabel(/producer/i)
          .first()
          .fill("Celler del Contacte");
        await page
          .getByLabel(/wine name/i)
          .first()
          .fill("Vinya de Mostra");
        await page.getByRole("button", { name: /review/i }).click();
        await page.getByRole("button", { name: /^confirm/i }).click();
        await page.waitForTimeout(1500);
        await page.goto("/memory");
        await page.waitForLoadState("networkidle");
        const href = await page.locator('a[href*="/evidence"]').first().getAttribute("href");
        const wineId = href?.split("/wines/")[1]?.split("/")[0] ?? "";
        expect(wineId.length).toBeGreaterThan(0);

        const directory = resolve(outputRoot, theme, size.name);
        mkdirSync(directory, { recursive: true });
        const screens: [string, string][] = [
          ["home", "/"],
          ["quick-log", "/log/new"],
          ["identify", "/log/identify"],
          ["memory", "/memory"],
          ["evidence", `/wines/${wineId}/evidence`],
          ["taste-appearance", `/wines/${wineId}/taste`],
          ["sessions", "/sessions"],
          ["session-new", "/sessions/new"],
          ["vicenc", "/vicenc"],
          ["cellar", "/cellar"],
          ["wishlist", "/wishlist"],
          ["shop", "/shop"],
          ["spaces", "/spaces"],
          ["data-rights", "/settings/data"],
          ["about", "/about"],
        ];
        for (const [name, path] of screens) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(400);
          await page.screenshot({ fullPage: true, path: resolve(directory, `${name}.png`) });
        }

        // A grape's card from the wine library.
        await page.goto("/library/grapes/tempranillo");
        await page.waitForLoadState("networkidle");
        await page.screenshot({ fullPage: true, path: resolve(directory, "library-grape.png") });
        // …and a registered wine name from its atlas.
        await page.goto("/library/region?name=Rioja&country=ES");
        await page.waitForURL(/\/library\/regions\//);
        await page.waitForLoadState("networkidle");
        await page.screenshot({ fullPage: true, path: resolve(directory, "library-region.png") });
        // The library browsed: the grape gallery, a country's names, the
        // styles and methods, and one of them.
        for (const [name, path] of [
          ["library-grapes", "/library"],
          ["library-regions", "/library?tab=regions&country=ES"],
          ["library-topics", "/library?tab=topics"],
          ["library-topic", "/library/topics/malolactic-fermentation"],
        ] as const) {
          await page.goto(path);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(400);
          // The first screen: the lists run to a hundred entries and more,
          // and a full-page shot of them is too long to look at.
          await page.screenshot({ path: resolve(directory, `${name}.png`) });
        }

        // The tasting's other steps: the nose and the palate, grouped into
        // titled runs like the context, and the context itself, the longest
        // form in the app.
        await page.goto(`/wines/${wineId}/taste`);
        await page.waitForLoadState("networkidle");
        for (const [name, pattern] of [
          ["taste-nose", /nose/i],
          ["taste-palate", /palate/i],
          ["taste-context", /context/i],
        ] as const) {
          await page.getByRole("button", { name: pattern }).click();
          await page.waitForTimeout(300);
          await page.screenshot({ fullPage: true, path: resolve(directory, `${name}.png`) });
        }

        await context.close();
      }
    });
  }
});
