import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * A spoken note fills the quick log, a deep tasting or the wine being added:
 * record, correct what was heard, fill.
 * The microphone is a tone and both voice steps are answered here, so the
 * test spends nothing; what it checks is the screen's side — only empty
 * fields are filled, a hedged value is left as a suggestion, and nothing typed
 * by hand is lost.
 */
// The service worker would answer the API itself, out of the test's reach.
test.use({ serviceWorkers: "block" });

/** A microphone that hums, the switch on, and both voice steps answered here. */
async function speak(
  page: Page,
  heard: string,
  fields: Record<string, { quote: string; status: string; value: unknown }>,
  region: { name: string; regionId: string } | null = null,
): Promise<{ extracted: () => string }> {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const context = new AudioContext();
      const tone = context.createOscillator();
      const sink = context.createMediaStreamDestination();
      tone.connect(sink);
      tone.start();
      return sink.stream;
    };
  });
  // The deployment's switch, as the bootstrap and a profile change both report it.
  await page.route(/\/api\/v1\/me(\/bootstrap)?$/, async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.data.features.voiceInput = true;
    await route.fulfill({ json: body, response });
  });
  await page.route("**/api/v1/spaces/*/voice/transcribe", (route) =>
    route.fulfill({ json: { data: { language: "es", seconds: 6, text: heard } } }),
  );
  let extracted = "";
  await page.route("**/api/v1/spaces/*/voice/extract", (route) => {
    extracted = (route.request().postDataJSON() as { text: string }).text;
    return route.fulfill({ json: { data: { fields, region, severalWines: false } } });
  });
  return { extracted: () => extracted };
}

/** Record, stop, and wait for what was heard. */
async function record(page: Page, heard: string) {
  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Recording… (up to 2 minutes)")).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(page.locator("#voice-note-text")).toHaveValue(heard, { timeout: 15_000 });
}

test("a spoken note fills only the quick log's empty fields", async ({ page }) => {
  const heard = "Loma de Nerea de Bodega Nudo. Creo que garnacha. Cereza y clavo. Un 85.";
  const voice = await speak(page, heard, {
    grapes: { quote: "Creo que garnacha", status: "ambiguous", value: ["Garnacha"] },
    noseText: { quote: "Cereza y clavo", status: "explicit", value: "Cereza y clavo" },
    producerName: { quote: "Bodega Nudo", status: "explicit", value: "Bodega Nudo" },
    score100: { quote: "Un 85", status: "explicit", value: 85 },
    wineName: { quote: "Loma de Nerea", status: "explicit", value: "Loma de Nerea" },
  });

  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/log/new");
  await page.locator("#interface-locale").selectOption("en");
  await page.locator("#wine-name").fill("Typed by hand");

  await record(page, heard);
  const transcript = page.locator("#voice-note-text");

  // The reader corrects what was heard before anything is read from it.
  await transcript.fill(`${heard} Corregido.`);
  await page.getByRole("button", { name: "Fill the form" }).click();
  await expect(page.getByText("3 fields filled. Review them before saving.")).toBeVisible();
  expect(voice.extracted()).toBe(`${heard} Corregido.`);
  await expect(page.getByText('Said with doubt, left for you: "Creo que garnacha".')).toBeVisible();

  await expect(page.locator("#wine-name")).toHaveValue("Typed by hand");
  await expect(page.locator("#producer-name")).toHaveValue("Bodega Nudo");
  await expect(page.locator("#comment")).toHaveValue("Cereza y clavo");

  // Sent for review only when asked: the words, the proposal and the form as left.
  let sent: { form: Record<string, unknown>; kind: string; text: string } | null = null;
  await page.route("**/api/v1/spaces/*/voice/reviews", (route) => {
    sent = route.request().postDataJSON();
    return route.fulfill({
      json: { data: { expiresAt: "2026-11-17T10:00:00.000Z", id: "r1" } },
      status: 201,
    });
  });
  await page.locator("#producer-name").fill("Bodega Nudo Corregida");
  await page.getByRole("button", { name: "Send this note to improve voice" }).click();
  await expect(page.getByText("Sent, thank you. It deletes itself in 30 days.")).toBeVisible();
  expect(sent!.kind).toBe("quick");
  expect(sent!.text).toBe(`${heard} Corregido.`);
  expect(sent!.form.producerName).toBe("Bodega Nudo Corregida");
});

test("a spoken note fills a deep tasting's empty fields, in every step", async ({ page }) => {
  const heard = "Rubí intenso. Mora y regaliz. Acidez alta. Creo que con cuerpo. Muy rico.";
  await speak(page, heard, {
    acidity: { quote: "Acidez alta", status: "explicit", value: 4 },
    appearanceText: { quote: "Rubí intenso", status: "explicit", value: "Rubí intenso" },
    body: { quote: "Creo que con cuerpo", status: "ambiguous", value: 4 },
    conclusionText: { quote: "Muy rico.", status: "explicit", value: "Muy rico." },
    noseText: { quote: "Mora y regaliz", status: "explicit", value: "Mora y regaliz" },
  });
  await signIn(page);
  await completeOnboarding(page);
  const token = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("firebase:authUser:"));
    return key === undefined
      ? ""
      : (JSON.parse(localStorage.getItem(key) ?? "{}").stsTokenManager?.accessToken ?? "");
  });
  const headers = { Authorization: `Bearer ${token}` };
  const api = "http://127.0.0.1:8788/api/v1";
  const me = await page.request.get(`${api}/me/bootstrap`, { headers });
  const spaceId = (await me.json()).data.user.activeSpaceId as string;
  const wine = await page.request.post(`${api}/spaces/${spaceId}/wines`, {
    data: {
      displayName: "Loma de Nerea",
      identityStatus: "confirmed",
      producerName: "Bodega Nudo",
      wineType: "red",
    },
    headers: { ...headers, "Idempotency-Key": "V".padEnd(43, "v") },
  });
  expect(wine.ok(), await wine.text()).toBeTruthy();
  const wineId = (await wine.json()).data.wine.id as string;

  await page.goto(`/wines/${wineId}/taste`);
  await page.locator("#interface-locale").selectOption("en");
  await record(page, heard);
  await page.getByRole("button", { name: "Fill the form" }).click();
  await expect(page.getByText("4 fields filled. Review them before saving.")).toBeVisible();
  await expect(
    page.getByText('Said with doubt, left for you: "Creo que con cuerpo".'),
  ).toBeVisible();

  await page.getByRole("button", { name: "Nose" }).click();
  await expect(page.getByLabel("Nose notes")).toHaveValue("Mora y regaliz");
  await page.getByRole("button", { name: "Conclusion" }).click();
  await expect(page.getByLabel("Personal conclusion")).toHaveValue("Muy rico.");
});

test("a spoken description finds the wine being added and fills its review", async ({ page }) => {
  const heard = "Loma de Nerea, de Bodega Nudo, 2022. Un tinto de Ries Baixes.";
  let searched = "";
  await page.route("**/api/v1/spaces/*/identifications", async (route) => {
    searched = (route.request().postDataJSON() as { manualHint?: string }).manualHint ?? "";
    await route.continue();
  });
  await speak(
    page,
    heard,
    {
      producerName: { quote: "Bodega Nudo", status: "explicit", value: "Bodega Nudo" },
      region: { quote: "Ries Baixes", status: "explicit", value: "Ries Baixes" },
      vintageYear: { quote: "2022", status: "explicit", value: 2022 },
      wineName: { quote: "Loma de Nerea", status: "explicit", value: "Loma de Nerea" },
      wineType: { quote: "Un tinto", status: "explicit", value: "red" },
    },
    { name: "Rías Baixas", regionId: "es-rias-baixas" },
  );
  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/log/identify");
  await page.locator("#interface-locale").selectOption("en");
  await record(page, heard);
  await page.getByRole("button", { name: "Fill the form" }).click();
  await expect(page.getByText(/fields filled\. Review them before saving\./)).toBeVisible({
    timeout: 15_000,
  });
  // Looked up as a typed hint would be, then the review takes what was said.
  expect(searched).toBe("Bodega Nudo Loma de Nerea 2022");
  await expect(page.locator("#identify-hint")).toHaveValue("Bodega Nudo Loma de Nerea 2022");
  await expect(page.locator("#wine-producer")).toHaveValue("Bodega Nudo");
  await expect(page.locator("#wine-name")).toHaveValue("Loma de Nerea");
  await expect(page.locator("#wine-vintage")).toHaveValue("2022");
  await expect(page.locator("#wine-type")).toHaveValue("red");
});
