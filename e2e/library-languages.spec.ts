import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { supportedLocales } from "../packages/i18n/src/runtime";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * The library reads in every interface language, and changing the language
 * changes what an open page shows: its summary comes back in the new
 * language, marked with that language, without leaving the page.
 *
 * The expected texts are read from the same files the library is loaded from,
 * so the drill checks the whole path — build, load, API, page — for one grape,
 * one registered name and one topic.
 */
type Summaries = Record<string, { text: string }>;

const read = <T>(path: string): T => JSON.parse(readFileSync(resolve(path), "utf8")) as T;
// The library stores Portuguese under its Wikipedia code.
const stored = (locale: string) => (locale === "pt-PT" ? "pt" : locale);

const grape = read<{ id: string; names: Record<string, string>; summaries: Summaries }[]>(
  "data/kb/grapes.json",
).find((entry) => entry.id === "tempranillo")!;
const region = read<{ id: string; summaries: Summaries }[]>("data/kb/appellations.json").find(
  (entry) => entry.id === "fr-sauternes",
)!;
const topic = read<{ id: string; summaries: Summaries }[]>("data/kb/topics.json").find(
  (entry) => entry.id === "red-wine",
)!;

const pages = [
  { path: `/library/grapes/${grape.id}`, summaries: grape.summaries },
  { path: `/library/regions/${region.id}`, summaries: region.summaries },
  { path: `/library/topics/${topic.id}`, summaries: topic.summaries },
];

test("the library follows the interface language", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await completeOnboarding(page);

  for (const { path, summaries } of pages) {
    await page.goto(path);
    const summary = page.locator(".library-summary p").first();
    for (const locale of supportedLocales) {
      await page.locator("#interface-locale").selectOption(locale);
      await expect(summary).toHaveText(summaries[stored(locale)]!.text, { timeout: 15_000 });
      await expect(summary).toHaveAttribute("lang", stored(locale));
    }
  }

  // A grape's name is the one its readers use: Ull de llebre in Catalan,
  // Aragonez in Portuguese.
  await page.goto(`/library/grapes/${grape.id}`);
  for (const locale of ["ca", "pt-PT"] as const) {
    await page.locator("#interface-locale").selectOption(locale);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(grape.names[stored(locale)]!);
  }
});
