import { describe, expect, it } from "vitest";

import { imageInfo, storablePhoto } from "../src/repositories/bottle-photo-image";

function jpeg(width: number, height: number): Uint8Array {
  return new Uint8Array([
    0xff,
    0xd8, // SOI
    0xff,
    0xe0,
    0x00,
    0x04,
    0x00,
    0x00, // a small APP0-ish segment to skip
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
    0x00,
  ]);
}

function webpVp8x(width: number, height: number): Uint8Array {
  const w = width - 1;
  const h = height - 1;
  const bytes = new Uint8Array(30);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // RIFF
  bytes.set([0x57, 0x45, 0x42, 0x50], 8); // WEBP
  bytes.set([0x56, 0x50, 0x38, 0x58], 12); // VP8X
  bytes[24] = w & 0xff;
  bytes[25] = (w >> 8) & 0xff;
  bytes[26] = (w >> 16) & 0xff;
  bytes[27] = h & 0xff;
  bytes[28] = (h >> 8) & 0xff;
  bytes[29] = (h >> 16) & 0xff;
  return bytes;
}

describe("reading an image header", () => {
  it("reads JPEG dimensions from the start-of-frame", () => {
    expect(imageInfo(jpeg(1200, 800))).toEqual({
      height: 800,
      mimeType: "image/jpeg",
      width: 1200,
    });
  });

  it("reads WebP (VP8X) dimensions", () => {
    expect(imageInfo(webpVp8x(640, 480))).toEqual({
      height: 480,
      mimeType: "image/webp",
      width: 640,
    });
  });

  it("refuses bytes that are neither JPEG nor WebP", () => {
    expect(imageInfo(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull(); // PNG
    expect(imageInfo(new Uint8Array([0x00, 0x01, 0x02, 0x03]))).toBeNull();
  });

  it("refuses an oversized image, so what is shown is what can be saved", () => {
    // The picker and the save used to disagree here: the proxy accepted any
    // JPEG, the import refused one over 2048px. An oversized thumbnail therefore
    // rendered and then failed to save. One predicate now answers both.
    const oversized = jpeg(3000, 1200);
    expect(imageInfo(oversized)).not.toBeNull();
    expect(storablePhoto(oversized)).toBeNull();
    expect(storablePhoto(jpeg(1200, 800))).toEqual({
      height: 800,
      mimeType: "image/jpeg",
      width: 1200,
    });
  });
});
