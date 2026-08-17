export type ProcessedImage = {
  blob: Blob;
  byteSize: number;
  height: number;
  mimeType: "image/jpeg";
  sha256: string;
  width: number;
};

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function canvasBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob === null ? reject(new Error("The image could not be re-encoded.")) : resolve(blob),
      "image/jpeg",
      0.86,
    );
  });
}

async function loadImage(
  file: File,
): Promise<{ close: () => void; height: number; source: CanvasImageSource; width: number }> {
  if ("createImageBitmap" in globalThis) {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return {
      close: () => bitmap.close(),
      height: bitmap.height,
      source: bitmap,
      width: bitmap.width,
    };
  }
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return {
    close: () => URL.revokeObjectURL(url),
    height: image.naturalHeight,
    source: image,
    width: image.naturalWidth,
  };
}

/** A copy backed by a plain ArrayBuffer, which is what a Blob will take. */
function copyOf(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(bytes.length));
  out.set(bytes);
  return out;
}

/**
 * Remove every application segment a JPEG encoder may have added.
 *
 * Re-encoding through a canvas is supposed to leave nothing behind, and in
 * Chromium it does. WebKit's encoder writes an APP1 segment regardless, and the
 * server refuses any JPEG carrying one — deliberately, because APP1 is where a
 * photograph's GPS coordinates live. The result was that every upload from an
 * iPhone was rejected, in every path, and the offline queue simply stopped
 * draining.
 *
 * So the bytes are cleaned here rather than the check being loosened there. The
 * server's rule is the guarantee; this is what stops us breaking it.
 */
export function stripJpegSegments(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return copyOf(bytes);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return copyOf(bytes);
    const marker = bytes[offset + 1]!;
    // Start of scan: the rest is entropy-coded data and is copied verbatim.
    if (marker === 0xda) {
      kept.push(bytes.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      kept.push(bytes.subarray(offset, offset + 2));
      break;
    }
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length) return copyOf(bytes);
    // APP1 through APP15 carry metadata — EXIF, XMP, colour profiles. None of
    // it is needed to draw the image, and the first of them is the one that
    // carries where the photograph was taken.
    const isMetadata = marker >= 0xe1 && marker <= 0xef;
    if (!isMetadata) kept.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(new ArrayBuffer(total));
  let cursor = 0;
  for (const part of kept) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/**
 * Clean bytes that were already encoded and stored.
 *
 * A photograph queued before the strip existed carries the segment the server
 * refuses, and the queue never re-encodes: it replays the bytes it kept. Those
 * writes could not have succeeded on any later attempt, which is exactly what
 * happened — two of them sat in a queue for days, blocking everything behind
 * them.
 *
 * Returns null when there was nothing to remove, so a caller can tell the
 * ordinary case from the one where the digest it recorded is now stale.
 */
export async function recleanEncodedImage(
  blob: Blob,
): Promise<{ blob: Blob; byteSize: number; sha256: string } | null> {
  const original = new Uint8Array(await blob.arrayBuffer());
  const cleaned = stripJpegSegments(original);
  // Stripping only ever removes, so equal lengths mean nothing was removed.
  if (cleaned.length === original.length) return null;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", cleaned));
  return {
    blob: new Blob([cleaned], { type: blob.type }),
    byteSize: cleaned.length,
    sha256: base64Url(digest),
  };
}

export async function preprocessImage(file: File): Promise<ProcessedImage> {
  if (!["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(file.type)) {
    throw new Error("Unsupported image type.");
  }
  const image = await loadImage(file);
  try {
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (context === null) throw new Error("Image processing is unavailable.");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(image.source, 0, 0, width, height);
    const encoded = await canvasBlob(canvas);
    // Cleaned before it is measured and hashed, so the byte size, the digest and
    // the bytes the server receives are all the same thing.
    const cleaned = stripJpegSegments(new Uint8Array(await encoded.arrayBuffer()));
    const blob = new Blob([cleaned], { type: "image/jpeg" });
    if (blob.size > 5 * 1024 * 1024) throw new Error("The processed image is still too large.");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", cleaned));
    return {
      blob,
      byteSize: blob.size,
      height,
      mimeType: "image/jpeg",
      sha256: base64Url(digest),
      width,
    };
  } finally {
    image.close();
  }
}
