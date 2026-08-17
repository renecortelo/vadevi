import { describe, expect, it } from "vitest";

import { stripJpegSegments } from "./image";

/**
 * The bytes an iPhone produced could not be uploaded.
 *
 * The server refuses any JPEG carrying an APP1 segment, deliberately: APP1 is
 * where a photograph's GPS coordinates live. Re-encoding through a canvas is
 * supposed to leave nothing behind, and in Chromium it does — WebKit's encoder
 * writes an APP1 regardless. Every upload from an iPhone was rejected, in every
 * path, and the offline queue simply stopped draining.
 */

/** A JPEG-shaped buffer: SOI, the given segments, SOF0, SOS, EOI. */
function jpeg(segments: { marker: number; payload: number[] }[]): Uint8Array {
  const bytes: number[] = [0xff, 0xd8];
  for (const segment of segments) {
    const length = segment.payload.length + 2;
    bytes.push(0xff, segment.marker, length >> 8, length & 0xff, ...segment.payload);
  }
  // SOF0, length 11: precision(1) + height(2) + width(2) + component count(1) +
  // one three-byte component descriptor. The declared length has to match the
  // bytes that follow it, or a walker reads the next marker from the middle of
  // this one and every assertion after that is measuring noise.
  bytes.push(0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x10, 0x00, 0x10, 0x01, 0x01, 0x11, 0x00);
  bytes.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x00, 0x00, 0x3f, 0x00);
  bytes.push(0x12, 0x34, 0x56, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

/**
 * Whether a segment appears before the scan, walked the way a decoder walks it
 * rather than by searching for the two bytes — the marker pair occurs inside
 * payloads too, and a search would answer a different question.
 */
function hasSegment(bytes: Uint8Array, wanted: number): boolean {
  for (let offset = 2; offset + 4 <= bytes.length;) {
    if (bytes[offset] !== 0xff) return false;
    const marker = bytes[offset + 1]!;
    if (marker === 0xda || marker === 0xd9) return false;
    if (marker === wanted) return true;
    offset += 2 + ((bytes[offset + 2]! << 8) | bytes[offset + 3]!);
  }
  return false;
}

const app0 = 0xe0;
const app1 = 0xe1;

describe("stripping metadata from an encoded JPEG", () => {
  it("removes the APP1 segment the server refuses", () => {
    // "Exif\0\0" then a scrap of payload, which is the shape WebKit writes.
    const withExif = jpeg([{ marker: app1, payload: [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2, 3, 4] }]);
    expect(hasSegment(withExif, app1)).toBe(true);
    expect(hasSegment(stripJpegSegments(withExif), app1)).toBe(false);
  });

  it("keeps the JFIF header and the image data", () => {
    const withBoth = jpeg([
      { marker: app0, payload: [0x4a, 0x46, 0x49, 0x46, 0] },
      { marker: app1, payload: [0x45, 0x78, 0x69, 0x66, 0, 0] },
    ]);
    const stripped = stripJpegSegments(withBoth);
    // Stripping metadata must not produce something undecodable: APP0 stays,
    // the file still opens and closes as a JPEG, and the scan data survives.
    expect(hasSegment(stripped, app0)).toBe(true);
    expect(hasSegment(stripped, app1)).toBe(false);
    expect([stripped[0], stripped[1]]).toEqual([0xff, 0xd8]);
    expect([stripped.at(-5), stripped.at(-4), stripped.at(-3)]).toEqual([0x12, 0x34, 0x56]);
    expect([stripped.at(-2), stripped.at(-1)]).toEqual([0xff, 0xd9]);
  });

  it("leaves a JPEG that has nothing to strip byte-for-byte the same", () => {
    const clean = jpeg([{ marker: app0, payload: [0x4a, 0x46, 0x49, 0x46, 0] }]);
    expect([...stripJpegSegments(clean)]).toEqual([...clean]);
  });

  it("returns anything that is not a JPEG untouched", () => {
    const notJpeg = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    expect([...stripJpegSegments(notJpeg)]).toEqual([...notJpeg]);
  });
});
