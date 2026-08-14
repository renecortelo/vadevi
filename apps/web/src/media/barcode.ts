/**
 * Barcode reading in the browser.
 *
 * Only the decoded digits ever reach the server — no image is created for a
 * scan, so scanning costs no storage, no upload, and no provider call. That
 * makes it the cheapest and most private of the identification paths.
 *
 * `BarcodeDetector` is available in Chromium browsers and Android. Safari does
 * not implement it, and photographing bottles is very likely an iPhone
 * activity, so callers must handle `unsupported` rather than assume a scanner.
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

export function isBarcodeScanningSupported(): boolean {
  return detectorConstructor() !== null;
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

export type ScanOutcome =
  { barcode: string; kind: "found" } | { kind: "none" } | { kind: "unsupported" };

/**
 * Read a barcode from one video frame.
 *
 * Returns `unsupported` where `BarcodeDetector` is missing so the caller can
 * offer manual entry instead of appearing broken.
 */
export async function scanFrame(source: CanvasImageSource): Promise<ScanOutcome> {
  const Detector = detectorConstructor();
  if (Detector === null) return { kind: "unsupported" };

  try {
    const detector = new Detector({ formats: wineFormats });
    const results = await detector.detect(source);
    for (const result of results) {
      const digits = result.rawValue.replaceAll(/\D/g, "");
      // A UPC-A is an EAN-13 with a leading zero; normalizing here means a
      // bottle scanned on either symbology matches the same stored record.
      const normalized = digits.length === 12 ? `0${digits}` : digits;
      if (hasValidCheckDigit(digits) || hasValidCheckDigit(normalized)) {
        return { barcode: normalized, kind: "found" };
      }
    }
    return { kind: "none" };
  } catch {
    return { kind: "none" };
  }
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
