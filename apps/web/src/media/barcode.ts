import type { ReadInputBarcodeFormat, readBarcodes } from "zxing-wasm/reader";

/** Just the part of the module this file uses, so the dynamic import stays typed. */
type Decoder = { readBarcodes: typeof readBarcodes };

/**
 * Barcode reading in the browser.
 *
 * Only the decoded digits ever reach the server — no image is created for a
 * scan, so scanning costs no storage, no upload, and no provider call. That
 * makes it the cheapest and most private of the identification paths.
 *
 * `BarcodeDetector` is available in Chromium browsers and Android, and Safari
 * does not implement it — which used to mean no scanning on iPhone at all, on
 * the platform where photographing bottles is most likely. Installing another
 * browser there does not help: iOS requires every browser to use WebKit, so
 * Chrome for iPhone is Safari with a different interface and the same gap.
 *
 * So where the browser has no detector, one is decoded here instead: ZXing,
 * compiled to WebAssembly, imported only at the moment it is needed. Nothing
 * changes for a browser that does have `BarcodeDetector` — it never downloads
 * the module at all.
 */

/** Symbologies that actually appear on wine bottles. */
const wineFormats = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;

type DetectedBarcode = { format: string; rawValue: string };

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource | ImageBitmapSource) => Promise<DetectedBarcode[]>;
};

type BarcodeDetectorConstructor = {
  getSupportedFormats?: () => Promise<string[]>;
  new (options?: { formats?: readonly string[] }): BarcodeDetectorLike;
};

function detectorConstructor(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor })
    .BarcodeDetector;
  return typeof candidate === "function" ? candidate : null;
}

/** Whether decoding will need the WebAssembly module fetched first. */
export function needsDecoderDownload(): boolean {
  return detectorConstructor() === null;
}

/**
 * The decoder, fetched once and kept.
 *
 * Imported dynamically so it stays out of the initial route: a browser that
 * never opens the identification screen never pays for it, and one with a
 * native detector never fetches it at all.
 */
let decoderPromise: Promise<Decoder> | null = null;

function loadDecoder(): Promise<Decoder> {
  decoderPromise ??= (async () => {
    const [reader, { default: wasmUrl }] = await Promise.all([
      import("zxing-wasm/reader"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
    // The library fetches its WebAssembly from a public CDN by default. That
    // would be a request to a third party from a member's browser, and the
    // deployed Content-Security-Policy blocks it outright — correctly. Vite
    // emits the file as an asset of this origin, and this points the loader at
    // it, so nothing leaves the deployment.
    reader.prepareZXingModule({ overrides: { locateFile: () => wasmUrl } });
    return reader;
  })();
  return decoderPromise;
}

/** Warm the decoder before the first frame, so scanning does not start by stalling. */
export function prepareDecoder(): void {
  if (needsDecoderDownload()) void loadDecoder().catch(() => undefined);
}

/**
 * EAN-13 and UPC-A carry a check digit. Verifying it locally discards
 * misreads before they become a wasted lookup or a wrong candidate.
 */
export function hasValidCheckDigit(barcode: string): boolean {
  if (!/^\d{8}$|^\d{12,13}$/.test(barcode)) return false;
  const digits = [...barcode].map((character) => Number.parseInt(character, 10));
  const check = digits.pop()!;
  // Weights alternate 3 and 1 from the rightmost body digit leftwards.
  const sum = digits
    .reverse()
    .reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

export type ScanOutcome = { barcode: string; kind: "found" } | { kind: "none" };

/**
 * Read a barcode from one video frame, by whichever route this browser has.
 */
export async function scanFrame(source: CanvasImageSource): Promise<ScanOutcome> {
  const Detector = detectorConstructor();
  if (Detector !== null) {
    try {
      const detector = new Detector({ formats: wineFormats });
      return firstValid((await detector.detect(source)).map((result) => result.rawValue));
    } catch {
      return { kind: "none" };
    }
  }
  // No native detector: draw the frame and hand the pixels to the decoder.
  const pixels = toImageData(source);
  return pixels === null ? { kind: "none" } : decodeImageData(pixels);
}

/**
 * Decode a still image — a photograph the member just took.
 *
 * This is the path that works on every browser and every iOS version, because
 * it needs no live camera stream: `<input type="file" capture>` opens the
 * camera, and one frame comes back. It is also the honest fallback when a live
 * scan cannot hold focus on a curved bottle.
 */
export async function scanImageFile(file: Blob): Promise<ScanOutcome> {
  try {
    const { readBarcodes } = await loadDecoder();
    const results = await readBarcodes(file, { formats: zxingFormats, tryHarder: true });
    return firstValid(results.map((result) => result.text));
  } catch {
    return { kind: "none" };
  }
}

async function decodeImageData(pixels: ImageData): Promise<ScanOutcome> {
  try {
    const { readBarcodes } = await loadDecoder();
    // `tryHarder` is off for live frames: another frame arrives in a moment, and
    // a slower, more thorough pass would cost more than it gains.
    const results = await readBarcodes(pixels, { formats: zxingFormats, tryHarder: false });
    return firstValid(results.map((result) => result.text));
  } catch {
    return { kind: "none" };
  }
}

/** The same four symbologies, spelled the way ZXing spells them. */
const zxingFormats: ReadInputBarcodeFormat[] = ["EAN-13", "EAN-8", "UPC-A", "UPC-E"];

/** The first candidate whose check digit holds, normalized to EAN-13. */
function firstValid(values: string[]): ScanOutcome {
  for (const value of values) {
    const digits = value.replaceAll(/\D/g, "");
    // A UPC-A is an EAN-13 with a leading zero; normalizing here means a
    // bottle scanned on either symbology matches the same stored record.
    const normalized = digits.length === 12 ? `0${digits}` : digits;
    if (hasValidCheckDigit(digits) || hasValidCheckDigit(normalized)) {
      return { barcode: normalized, kind: "found" };
    }
  }
  return { kind: "none" };
}

/** Pixels for the decoder, via a canvas the caller never sees. */
function toImageData(source: CanvasImageSource): ImageData | null {
  // `CanvasImageSource` spans several shapes; a video reports its intrinsic size
  // under different names, and a `VideoFrame` under different ones again.
  const sized = source as {
    height?: number;
    videoHeight?: number;
    videoWidth?: number;
    width?: number;
  };
  const width = sized.videoWidth ?? sized.width ?? 0;
  const height = sized.videoHeight ?? sized.height ?? 0;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (context === null) return null;
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

/**
 * Open the rear camera for scanning.
 *
 * The caller owns the returned stream and must stop its tracks, because an
 * unreleased camera keeps the recording indicator lit.
 */
export async function openScannerStream(): Promise<MediaStream | null> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: { ideal: "environment" } },
    });
  } catch {
    // A refused or unavailable camera is an ordinary outcome, not an error:
    // every identification path has a manual fallback.
    return null;
  }
}

export function stopStream(stream: MediaStream | null): void {
  for (const track of stream?.getTracks() ?? []) track.stop();
}
