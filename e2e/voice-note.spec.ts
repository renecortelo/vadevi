import { expect, test } from "./fixtures/server";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * A spoken note fills the quick log: record, correct what was heard, fill.
 * The microphone is a tone and both voice steps are answered here, so the
 * test spends nothing; what it checks is the screen's side — only empty
 * fields are filled, a hedged value is left as a suggestion, and nothing typed
 * by hand is lost.
 */
// The service worker would answer the API itself, out of the test's reach.
test.use({ serviceWorkers: "block" });

test("a spoken note fills only the quick log's empty fields", async ({ page }) => {
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
  const heard = "Loma de Nerea de Bodega Nudo. Creo que garnacha. Cereza y clavo. Un 85.";
  await page.route("**/api/v1/spaces/*/voice/transcribe", (route) =>
    route.fulfill({ json: { data: { language: "es", seconds: 6, text: heard } } }),
  );
  let extracted = "";
  await page.route("**/api/v1/spaces/*/voice/extract", (route) => {
    extracted = (route.request().postDataJSON() as { text: string }).text;
    return route.fulfill({
      json: {
        data: {
          fields: {
            grapes: { quote: "Creo que garnacha", status: "ambiguous", value: ["Garnacha"] },
            noseText: { quote: "Cereza y clavo", status: "explicit", value: "Cereza y clavo" },
            producerName: { quote: "Bodega Nudo", status: "explicit", value: "Bodega Nudo" },
            score100: { quote: "Un 85", status: "explicit", value: 85 },
            wineName: { quote: "Loma de Nerea", status: "explicit", value: "Loma de Nerea" },
          },
          region: null,
          severalWines: false,
        },
      },
    });
  });

  await signIn(page);
  await completeOnboarding(page);
  await page.goto("/log/new");
  await page.locator("#interface-locale").selectOption("en");
  await page.locator("#wine-name").fill("Typed by hand");

  await page.getByRole("button", { name: "Record" }).click();
  await expect(page.getByText("Recording… (up to 2 minutes)")).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByRole("button", { name: "Stop" }).click();
  const transcript = page.locator("#voice-note-text");
  await expect(transcript).toHaveValue(heard, { timeout: 15_000 });

  // The reader corrects what was heard before anything is read from it.
  await transcript.fill(`${heard} Corregido.`);
  await page.getByRole("button", { name: "Fill the form" }).click();
  await expect(page.getByText("3 fields filled. Review them before saving.")).toBeVisible();
  expect(extracted).toBe(`${heard} Corregido.`);
  await expect(page.getByText('Said with doubt, left for you: "Creo que garnacha".')).toBeVisible();

  await expect(page.locator("#wine-name")).toHaveValue("Typed by hand");
  await expect(page.locator("#producer-name")).toHaveValue("Bodega Nudo");
  await expect(page.locator("#comment")).toHaveValue("Cereza y clavo");
});
