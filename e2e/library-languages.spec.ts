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

// A name Wikipedia has no article for reads the link with its area from its
// single document in the Official Journal, in the Union's own translation,
// and says so — with the Journal's page in the reader's language.
test("a summary from the Official Journal names its source", async ({ page }) => {
  const journal = read<{ id: string; summaries: Record<string, { text: string; url: string }> }[]>(
    "data/kb/appellations.json",
  ).find((entry) => entry.id === "it-alpi-retiche")!;
  await signIn(page);
  await completeOnboarding(page);
  await page.goto(`/library/regions/${journal.id}`);
  await page.locator("#interface-locale").selectOption("es");
  await expect(page.locator(".library-summary p").first()).toHaveText(journal.summaries.es!.text, {
    timeout: 15_000,
  });
  const source = page.locator(".library-summary a");
  await expect(source).toHaveText(
    "Del documento único de la denominación · Diario Oficial de la UE",
  );
  await expect(source).toHaveAttribute("href", journal.summaries.es!.url);
});

// A name protected before 2011, with neither an article nor a Journal
// publication, reads its link from its technical file in the register: in the
// language it was filed in, or in a translation marked as one.
test("a summary from the register's technical file names its source", async ({ page }) => {
  const entry = read<
    { id: string; summaries: Record<string, { text: string; translated?: boolean; url: string }> }[]
  >("data/kb/appellations.json").find((candidate) => candidate.id === "gr-malvasia-paros")!;
  await signIn(page);
  await completeOnboarding(page);
  await page.goto(`/library/regions/${entry.id}`);
  await page.locator("#interface-locale").selectOption("es");
  const shown = entry.summaries.es ?? entry.summaries.el!;
  await expect(page.locator(".library-summary p").first()).toHaveText(shown.text, {
    timeout: 15_000,
  });
  const source = page.locator(".library-summary a");
  await expect(source).toHaveText(
    "Del pliego técnico de la denominación · Registro de indicaciones geográficas de la UE (eAmbrosia)",
  );
  await expect(source).toHaveAttribute("href", shown.url);
  await expect(page.locator(".library-summary .section-help")).toContainText(
    entry.summaries.es === undefined
      ? "aún no disponible en tu idioma"
      : "traducido del idioma del documento",
  );
});
