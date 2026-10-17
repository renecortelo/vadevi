import AxeBuilder from "@axe-core/playwright";
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

// A name beyond the EU, from its country's own register: an American
// Viticultural Area, cited to its section of 27 CFR part 9, drawn on the
// Americas' sheet at a point inside its official boundary.
test("an American Viticultural Area cites the US register", async ({ page }) => {
  const entry = read<{ id: string; legalUrl: string; registerRef: string; summaries: Summaries }[]>(
    "data/kb/appellations.json",
  ).find((candidate) => candidate.id === "us-napa-valley")!;
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library?tab=regions&country=US");
  // The name itself, not "Crystal Springs of Napa Valley".
  const row = page
    .locator(".library-rows a")
    .filter({ has: page.getByText("Napa Valley", { exact: true }) });
  await expect(row).toContainText("AVA", { timeout: 15_000 });
  await row.click();
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Napa Valley", { timeout: 15_000 });
  await expect(page.locator(".page-heading")).toContainText("American Viticultural Area (AVA)");
  await expect(page.locator(".library-summary p").first()).toHaveText(entry.summaries.en!.text);
  await expect(page.locator("#region-register")).toHaveText(
    "In the US register of viticultural areas",
  );
  const link = page.locator('a[href*="ecfr.gov"]');
  await expect(link).toHaveAttribute("href", entry.legalUrl);
  await expect(link).toContainText(entry.registerRef);
  await expect(page.locator(".library-map svg")).toBeVisible();
  await expect(page.locator(".library-map__point")).toBeVisible();
  await expect(page.getByText("Inside its official boundary")).toBeVisible();
});

test("a New Zealand geographical indication links to IPONZ's register", async ({ page }) => {
  const entry = read<{ id: string; legalUrl: string; registerRef: string; summaries: Summaries }[]>(
    "data/kb/appellations.json",
  ).find((candidate) => candidate.id === "nz-marlborough")!;
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library?tab=regions&country=NZ");
  const row = page
    .locator(".library-rows a")
    .filter({ has: page.getByText("Marlborough", { exact: true }) });
  await expect(row).toContainText("GI", { timeout: 15_000 });
  await row.click();
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Marlborough", { timeout: 15_000 });
  await expect(page.locator(".page-heading")).toContainText("Geographical indication (GI)");
  await expect(page.locator(".library-summary p").first()).toHaveText(entry.summaries.en!.text);
  await expect(page.locator("#region-register")).toHaveText(
    "In New Zealand's register of geographical indications",
  );
  const link = page.locator('a[href*="iponz.govt.nz"]');
  await expect(link).toHaveAttribute("href", entry.legalUrl);
  await expect(link).toContainText(`IP number ${entry.registerRef}`);
  await expect(page.locator(".library-map__point")).toBeVisible();
  await expect(page.getByText("Points: © OpenStreetMap contributors")).toBeVisible();
});

test("a Wine of Origin district shows where it lies in the scheme", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/za-stellenbosch");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Stellenbosch", { timeout: 15_000 });
  await expect(page.locator(".page-heading")).toContainText("Wine of Origin (WO)");
  await expect(page.getByText("A district of the Wine of Origin scheme.")).toBeVisible();
  await expect(page.locator('a[href*="sawis.co.za"]')).toBeVisible();
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting.getByRole("link", { name: "Coastal Region" })).toBeVisible();
  await expect(nesting).toContainText("Coastal Region · region");
  await expect(nesting).toContainText("Western Cape · geographical unit");
  // Its wards, one of them followed to its own page.
  await nesting.getByRole("link", { name: "Banghoek" }).click();
  await expect(page.locator("h1")).toHaveText("Banghoek", { timeout: 15_000 });
  await expect(page.getByText("A ward of the Wine of Origin scheme.")).toBeVisible();
  await expect(nesting.getByRole("link", { name: "Stellenbosch", exact: true })).toBeVisible();
});

test("an Australian region shows its register entry and its zone", async ({ page }) => {
  const entry = read<{ id: string; legalUrl: string; summaries: Summaries }[]>(
    "data/kb/appellations.json",
  ).find((candidate) => candidate.id === "au-barossa-valley")!;
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library?tab=regions&country=AU");
  const row = page
    .locator(".library-rows a")
    .filter({ has: page.getByText("Barossa Valley", { exact: true }) });
  await expect(row).toContainText("GI", { timeout: 15_000 });
  await row.click();
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Barossa Valley", { timeout: 15_000 });
  await expect(page.locator(".library-summary p").first()).toHaveText(entry.summaries.en!.text);
  await expect(page.locator("#region-register")).toHaveText(
    "In Australia's Register of Protected GIs",
  );
  await expect(page.getByText("An Australian geographical indication: a region.")).toBeVisible();
  await expect(page.getByText("In the register since August 15, 1997.")).toBeVisible();
  await expect(page.locator('a[href*="wineaustralia.com"]')).toHaveAttribute(
    "href",
    entry.legalUrl,
  );
  await expect(
    page.getByText("Inside its official boundary, as Wine Australia draws it."),
  ).toBeVisible();
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting).toContainText("Barossa · zone");
  await expect(nesting).toContainText("South Australia · state");
});

test("a Chilean area shows its place in the decree's zoning", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/cl-apalta");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Apalta", { timeout: 15_000 });
  await expect(page.locator(".page-heading")).toContainText("Denomination of origin (DO)");
  await expect(page.locator("#region-register")).toHaveText("In Chile's viticultural zoning");
  await expect(
    page.getByText("An area of Chile's viticultural zoning (Decree 464)."),
  ).toBeVisible();
  await expect(page.locator('a[href*="leychile"]')).toContainText("Decree 464 of 1994");
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting).toContainText("Valle de Colchagua · zone");
  await expect(nesting).toContainText("Valle del Rapel · subregion");
  await expect(nesting).toContainText("Región del Valle Central · region");
  await expect(page.locator(".library-map__point")).toBeVisible();
});

test("an Argentine indication shows its resolution and where it lies", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/ar-agrelo");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Agrelo", { timeout: 15_000 });
  await expect(page.locator(".page-heading")).toContainText("Geographical indication (IG)");
  await expect(page.locator("#region-register")).toHaveText(
    "In Argentina's register of geographical indications (INV)",
  );
  await expect(page.getByText("Recognised by Resolución INV Nº C.21/2005.")).toBeVisible();
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting.getByRole("link", { name: "Luján de Cuyo" })).toBeVisible();
  await expect(nesting.getByRole("link", { name: "Cuyo", exact: true })).toBeVisible();
});

test("a Mexican indication cites its declaration in the Diario Oficial", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/mx-queretaro");
  await page.locator("#interface-locale").selectOption("es");
  await expect(page.locator("h1")).toHaveText("Vinos de la Región Vitivinícola de Querétaro", {
    timeout: 15_000,
  });
  await expect(page.locator("#region-register")).toHaveText(
    "En las declaraciones de indicaciones geográficas de México (IMPI)",
  );
  await expect(page.getByText("Su declaración se publicó el 10 de marzo de 2025.")).toBeVisible();
  await expect(page.locator('a[href*="sidof.segob.gob.mx/notas/docFuente/5751385"]')).toHaveText(
    "Ver su declaración en el Diario Oficial de la Federación (DOF 10-03-2025)",
  );
  await expect(page.locator(".library-map__point")).toBeVisible();
});

test("a Brazilian denomination cites the INPI's list", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/br-altos-de-pinto-bandeira");
  await page.locator("#interface-locale").selectOption("pt-PT");
  await expect(page.locator("h1")).toHaveText("Altos de Pinto Bandeira", { timeout: 15_000 });
  await expect(page.locator(".page-heading")).toContainText("Denominação de origem (DO)");
  await expect(page.locator("#region-register")).toHaveText(
    "No registo de indicações geográficas do Brasil (INPI)",
  );
  await expect(page.getByText("Registada a 29 de novembro de 2022.")).toBeVisible();
  await expect(page.locator('a[href*="LISTACOMASDENOMINAESDEORIGEMRECONHECIDAS"]')).toHaveText(
    "Ver a lista de indicações reconhecidas do INPI (número BR412021000003-4)",
  );
  await expect(page.locator(".library-map__point")).toBeVisible();
});

test("a Swiss AOC shows its level and the canton's AOC it lies in", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/ch-dezaley");
  await page.locator("#interface-locale").selectOption("fr");
  await expect(page.locator("h1")).toHaveText("Dézaley", { timeout: 15_000 });
  await expect(page.locator("#region-register")).toHaveText("Dans le répertoire suisse des AOC");
  await expect(page.getByText("Une AOC régionale.")).toBeVisible();
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting.getByRole("link", { name: "Vaud" })).toBeVisible();
});

test("a Moldovan appellation cites AGEPI's register", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/md-tigheci");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Tigheci", { timeout: 15_000 });
  await expect(page.locator("#region-register")).toHaveText(
    "In Moldova's register of geographical indications (AGEPI)",
  );
  await expect(page.getByText("Registered on April 13, 2026.")).toBeVisible();
  await expect(
    page.locator('a[href*="db.agepi.md/GeogrIndications/Details.aspx?id=6049"]'),
  ).toHaveText("See its entry in AGEPI's register (DO-16)");
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting.getByRole("link", { name: "Valul lui Traian" })).toBeVisible();
});

test("an Ontario bench lies within the areas its table names", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/ca-st-davids-bench");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("St. David’s Bench", { timeout: 15_000 });
  await expect(page.locator("#region-register")).toHaveText("In Ontario's VQA viticultural areas");
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting.getByRole("link", { name: "Niagara Escarpment" })).toBeVisible();
  await expect(nesting.getByRole("link", { name: "Niagara-on-the-Lake" })).toBeVisible();
});

test("a wine region no register protects says so, and links its source", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/mx-valle-de-guadalupe");
  await page.locator("#interface-locale").selectOption("es");
  await expect(page.locator("h1")).toHaveText("Valle de Guadalupe", { timeout: 15_000 });
  await expect(page.locator("#region-register")).toHaveText("No es un nombre protegido");
  await expect(page.getByText(/Una región vinícola que ningún registro protege/)).toBeVisible();
  await expect(page.locator('a[href="https://en.wikipedia.org/wiki/Mexican_wine"]')).toHaveText(
    "Leer el artículo que la nombra",
  );
  await expect(
    page.getByText(/una región vitivinícola localizada en el municipio de Ensenada/),
  ).toBeVisible();
});

test("a summary from an official text credits it, and its translation", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/jp-nagano");
  await page.locator("#interface-locale").selectOption("es");
  await expect(page.locator("h1")).toHaveText("Nagano", { timeout: 15_000 });
  const summary = page.locator(".library-summary");
  await expect(summary).toContainText("En general, los vinos de Nagano");
  await expect(summary).toContainText("Del texto oficial del nombre, en su registro");
  await expect(summary).toContainText("traducido del idioma del documento");
  await expect(summary.locator('a[href*="nta.go.jp/english"]')).toBeVisible();
});

test("a Georgian appellation cites its registered document", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/ge-tsarapi");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Tsarapi", { timeout: 15_000 });
  await expect(page.locator("#region-register")).toHaveText(
    "In Georgia's state registry (Sakpatenti)",
  );
  await expect(page.getByText("Registered on May 11, 2020.")).toBeVisible();
  const summary = page.locator(".library-summary");
  await expect(summary).toContainText('"TSARAPI" is amber sec (dry) wine.');
  await expect(summary).toContainText("From the name's official text, in its register");
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting.getByRole("link", { name: "Kardenakhi" })).toBeVisible();
});

test("a British Columbia sub-GI lies within the Okanagan Valley", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/ca-naramata-bench");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Naramata Bench", { timeout: 15_000 });
  await expect(page.locator("#region-register")).toHaveText(
    "In British Columbia's geographical indications",
  );
  await expect(page.locator('a[href*="bclaws.gov.bc.ca"]')).toHaveText(
    "See section 56 of the Wines of Marked Quality Regulation (s. 56, item 8, BC Laws)",
  );
  const nesting = page.locator('section[aria-labelledby="region-nesting"]');
  await expect(nesting.getByRole("link", { name: "Okanagan Valley" })).toBeVisible();
});

test("a British wine name cites the UK register", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/regions/gb-sussex");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("Sussex", { timeout: 15_000 });
  await expect(page.locator(".page-heading")).toContainText("Protected designation of origin");
  await expect(page.locator("#region-register")).toHaveText(
    "In the UK register of protected food and drink names",
  );
  await expect(page.locator('a[href*="gov.uk/protected-food-drink-names"]')).toBeVisible();
});

test("the atlas in figures counts each country's names and leads to its list", async ({ page }) => {
  const atlas = read<{ countryCode: string }[]>("data/kb/appellations.json");
  const southAfrica = atlas.filter((entry) => entry.countryCode === "ZA").length;
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/library/atlas");
  await page.locator("#interface-locale").selectOption("en");
  await expect(page.locator("h1")).toHaveText("The atlas in figures", { timeout: 15_000 });
  const country = page.locator("article.atlas-coverage__country", {
    has: page.getByRole("link", { name: /South Africa/ }),
  });
  await expect(country).toContainText(`${southAfrica} names`);
  await expect(country.getByText("On the map")).toBeVisible();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    results.violations
      .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
      .map((violation) => `${violation.id} (${violation.impact}): ${violation.help}`),
  ).toEqual([]);
  await country.getByRole("link", { name: /South Africa/ }).click();
  await expect(page).toHaveURL(/tab=regions&country=ZA/);
});

test("figures move only for a reader who welcomes motion", async ({ page }) => {
  await signIn(page);
  await completeOnboarding(page);
  const bar = page.locator(".stats-bars__track > span").first();
  const animation = () => bar.evaluate((element) => getComputedStyle(element).animationName);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/library/atlas");
  await expect(bar).toBeAttached({ timeout: 15_000 });
  expect(await animation()).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.reload();
  await expect(bar).toBeAttached({ timeout: 15_000 });
  expect(await animation()).toBe("stats-bar-grow");
});
