import { expect, test } from "@playwright/test";
import { writeBarcode } from "zxing-wasm/writer";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

/**
 * Barcode reading without `BarcodeDetector`.
 *
 * Safari does not implement that API, and on iOS no browser can — every one of
 * them is required to use WebKit — so an iPhone had no scanner at all. The
 * decoder is WebAssembly now, and this proves it reads a real symbol rather
 * than that the module merely loads.
 *
 * The barcode is generated here by the same library's writer: a real EAN-13
 * with a valid check digit, encoded by one half and decoded by the other. It is
 * invented rather than copied off a bottle, and it is produced at run time so
 * no image is committed.
 */
const barcode = "8412345678905";

async function barcodePng(): Promise<Buffer> {
  const written = await writeBarcode(barcode, { format: "EAN-13", scale: 4 });
  if (written.image === null || written.image === undefined) {
    throw new Error("The writer produced no image.");
  }
  return Buffer.from(await written.image.arrayBuffer());
}

test.describe("barcode decoding", () => {
  test.describe.configure({ timeout: 180_000 });

  test("reads a photographed barcode without a native detector", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);

    // The identification request is the proof: it carries the decoded digits,
    // which can only have come from the image.
    const identification = page.waitForRequest(
      (request) =>
        request.url().includes("/identifications") &&
        request.method() === "POST" &&
        (request.postData() ?? "").includes(barcode),
      { timeout: 60_000 },
    );

    await page.goto("/log/identify");
    await page.waitForLoadState("networkidle");
    await page.setInputFiles("#identify-photo", {
      buffer: await barcodePng(),
      mimeType: "image/png",
      name: "bottle.png",
    });

    await identification;
  });

  test("says so plainly when a photo carries no barcode", async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
    await page.goto("/log/identify");
    await page.waitForLoadState("networkidle");

    // A blank image decodes to nothing. Saying nothing back would leave the
    // member believing it worked.
    await page.setInputFiles("#identify-photo", {
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        "base64",
      ),
      mimeType: "image/png",
      name: "blank.png",
    });

    await expect(page.getByText(/no barcode|ningún código/i)).toBeVisible({ timeout: 45_000 });
  });

  test("keeps the two policy conditions the decoder depends on", async ({ page }) => {
    const response = await page.goto("/");
    const policy = response?.headers()["content-security-policy"] ?? "";

    // Compiling WebAssembly needs this directive. Removing it does not break a
    // build or a type — it silently takes scanning away from every iPhone.
    expect(policy).toContain("'wasm-unsafe-eval'");

    // And it must stay the narrow one: `unsafe-eval` would allow JavaScript
    // from a string, which is a different thing entirely.
    expect(policy).not.toContain("'unsafe-eval'");
  });
});
