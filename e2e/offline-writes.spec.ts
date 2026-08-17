import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";
import { deflateSync } from "node:zlib";

import { completeOnboarding, signIn } from "./fixtures/sign-in";

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

/**
 * A small solid-colour PNG, built here rather than committed — the release scan
 * keeps image files out of the repository, and what this needs is only an image
 * the browser will decode, not a photograph of anything.
 */
function labelPhoto(): Buffer {
  const size = 64;
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(size * stride);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const at = y * stride + 1 + x * 3;
      raw[at] = 139;
      raw[at + 1] = 17;
      raw[at + 2] = 22;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * What the offline queue does with writes.
 *
 * The existing offline drills cover the shell: that it loads with the network
 * down, that the service worker updates, that storage pressure is announced.
 * None of them writes anything. A queue that replays is worth exactly nothing
 * if replaying it creates a second bottle, and duplicates are the failure people
 * only find weeks later, in their own data.
 *
 * Offline is simulated by refusing the API calls and telling the page it is
 * offline, rather than by dropping the whole context's network. Dropping it cuts
 * requests mid-flight underneath the development server, which made it fall over
 * about half the time in CI and took every later test with it. What is under
 * test here is the queue, not the transport, and this puts the application in
 * exactly the state the queue responds to — deterministically.
 */

/** Refuse the API and tell the page it has no network. */
async function goOffline(page: Page) {
  await page.route("**/api/v1/**", (route) => route.abort("internetdisconnected"));
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => false });
    globalThis.dispatchEvent(new Event("offline"));
  });
}

async function goOnline(page: Page) {
  await page.unroute("**/api/v1/**");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "onLine", { configurable: true, get: () => true });
    globalThis.dispatchEvent(new Event("online"));
  });
}
async function quickLog(page: Page, producer: string, name: string) {
  await page
    .getByLabel(/producer/i)
    .first()
    .fill(producer);
  await page
    .getByLabel(/wine name/i)
    .first()
    .fill(name);
  await page.getByRole("button", { name: /review/i }).click();
  await page.getByRole("button", { name: /^confirm/i }).click();
}

/**
 * How many wine *cards* carry this name — one card per record the server
 * returned, so a second record would be a second card. Counting elements rather
 * than text nodes matters: a name appearing twice inside one card would inflate
 * a text count and hide the thing being looked for.
 */
async function countCards(page: Page, name: string): Promise<number> {
  await page.goto("/memory");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  return page.locator("article.wine-card", { hasText: name }).count();
}

test.describe("offline writes", () => {
  test.describe.configure({ timeout: 180_000 });

  test.beforeEach(async ({ page }) => {
    await signIn(page);
    await completeOnboarding(page);
  });

  test("a wine logged offline syncs exactly once", async ({ page }) => {
    const name = "Vinya Offline Unica";
    // Open the screen while there is still a network, which is how this happens
    // to a person: they are in the restaurant with the form already in front of
    // them when the signal goes.
    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    await goOffline(page);
    await quickLog(page, "Celler Sintètic", name);
    await page.waitForTimeout(1000);

    await goOnline(page);
    await page.goto("/memory");
    // Give the queue a generous window to flush and settle.
    await expect.poll(async () => countCards(page, name), { timeout: 45_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2500);

    expect(await countCards(page, name)).toBe(1);
  });

  test("a photograph the server will never accept does not block the queue", async ({ page }) => {
    // The failure this reproduces: an upload the server refuses used to throw
    // out of the media loop, which reset the whole batch and retried it
    // identically for ever. Two such writes sat in a real queue for days, and
    // every wine logged afterwards queued behind them and never appeared.
    const blocked = "Vinya Amb Foto Rebutjada";
    const following = "Vinya Que Ve Darrere";

    // Refused permanently, the way a rejected photograph is refused: this is
    // the client's to fix, so retrying can never change the answer.
    await page.route("**/api/v1/spaces/*/media/*/content", async (route) => {
      if (route.request().method() !== "PUT") return route.fallback();
      await route.fulfill({
        body: JSON.stringify({
          error: { code: "MEDIA_REJECTED", message: "The image carries metadata." },
        }),
        contentType: "application/json",
        status: 422,
      });
    });

    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    // The photo section folds away so the shortest path does not scroll past it;
    // open it before reaching for the picker inside.
    await page.getByText(/private label photo|foto privada/i).click();
    await page.setInputFiles(".photo-picker input[type=file]", {
      buffer: labelPhoto(),
      mimeType: "image/png",
      name: "label.png",
    });
    // The picker only shows a preview once the image has been re-encoded, so
    // this is what says the photograph is on the draft rather than in flight.
    await expect(page.locator(".photo-preview img")).toBeVisible({ timeout: 30_000 });
    await quickLog(page, "Celler Sintètic", blocked);
    await page.waitForTimeout(1500);

    // Logged after it, with no photograph of its own. Before the fix this one
    // never left the device.
    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    await quickLog(page, "Domaine Fictif", following);

    await expect
      .poll(async () => countCards(page, following), { timeout: 60_000 })
      .toBeGreaterThan(0);
    // And the one that could not be sent is surfaced rather than silently
    // retried, so there is something to act on.
    expect(await countCards(page, blocked)).toBe(0);
    await expect(page.locator(".attention-panel")).toBeVisible({ timeout: 30_000 });
  });

  test("a reload while the write is still queued does not replay it twice", async ({ page }) => {
    const name = "Vinya Offline Recarregada";
    await page.goto("/log/new");
    await page.waitForLoadState("networkidle");
    // The reload has to be served by the service worker, so wait until one is
    // actually controlling the page rather than merely registered.
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, {
      timeout: 20_000,
    });
    await goOffline(page);
    await quickLog(page, "Domaine Fictif", name);
    await page.waitForTimeout(1000);

    // The queue lives in IndexedDB, so it survives the reload. Coming back
    // online with a restored queue is the moment a second copy would appear.
    await page.reload();
    await page.waitForTimeout(500);
    await goOnline(page);
    await page.goto("/memory");
    await expect.poll(async () => countCards(page, name), { timeout: 45_000 }).toBeGreaterThan(0);
    await page.waitForTimeout(2500);

    expect(await countCards(page, name)).toBe(1);
  });
});
