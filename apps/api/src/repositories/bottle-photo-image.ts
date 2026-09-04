// Reading an image's format and size from its own bytes.
//
// A bottle photo accepted from search is downloaded on the server, and the media
// record needs its exact type and dimensions — which a browser would have
// measured, but here nothing has. These parse the header only: the magic bytes
// for the format, and the width and height fields each format states up front. An
// image that is neither JPEG nor WebP, or whose header does not parse, returns
// null and is refused rather than stored with a guess.

export type ImageInfo = { height: number; mimeType: "image/jpeg" | "image/webp"; width: number };

function jpegDimensions(bytes: Uint8Array): { height: number; width: number } | null {
  // FF D8 opens a JPEG; segments follow as FF <marker> <2-byte length> <payload>.
  // A start-of-frame marker (C0–CF, excluding the huffman/arithmetic/restart ones)
  // carries precision, then height, then width, as big-endian 16-bit fields.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1]!;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2) return null;
    const isStartOfFrame =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isStartOfFrame) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      return height > 0 && width > 0 ? { height, width } : null;
    }
    offset += 2 + length;
  }
  return null;
}

function webpDimensions(bytes: Uint8Array): { height: number; width: number } | null {
  // RIFF....WEBP, then one chunk whose four-character code says how the size is
  // encoded: VP8X extended, VP8L lossless, VP8 lossy.
  if (bytes.length < 30) return null;
  const tag = (start: number): string => String.fromCharCode(...bytes.slice(start, start + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WEBP") return null;
  const chunk = tag(12);
  if (chunk === "VP8X") {
    const width = 1 + (bytes[24]! | (bytes[25]! << 8) | (bytes[26]! << 16));
    const height = 1 + (bytes[27]! | (bytes[28]! << 8) | (bytes[29]! << 16));
    return { height, width };
  }
  if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    const bits = bytes[21]! | (bytes[22]! << 8) | (bytes[23]! << 16) | (bytes[24]! << 24);
    const width = 1 + (bits & 0x3fff);
    const height = 1 + ((bits >> 14) & 0x3fff);
    return { height, width };
  }
  if (chunk === "VP8 ") {
    // Frame tag (3 bytes), start code 9D 01 2A, then 14-bit width and height LE.
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) return null;
    const width = ((bytes[26]! | (bytes[27]! << 8)) & 0x3fff) + 0;
    const height = ((bytes[28]! | (bytes[29]! << 8)) & 0x3fff) + 0;
    return width > 0 && height > 0 ? { height, width } : null;
  }
  return null;
}

/** The format and size of an image, from its header, or null if unrecognized. */
export function imageInfo(bytes: Uint8Array): ImageInfo | null {
  const jpeg = jpegDimensions(bytes);
  if (jpeg !== null) return { ...jpeg, mimeType: "image/jpeg" };
  const webp = webpDimensions(bytes);
  if (webp !== null) return { ...webp, mimeType: "image/webp" };
  return null;
}

/** The largest edge a stored photo may have — the media table's own CHECK. */
export const maxPhotoEdge = 2048;
/** The largest a stored photo may be — the media table's own CHECK. */
export const maxPhotoBytes = 5 * 1024 * 1024;

/**
 * Whether these bytes can actually be stored as a wine's photo.
 *
 * One predicate for both the proxy that SHOWS a candidate and the import that
 * SAVES it. They had the rule twice and it drifted: the proxy checked the format
 * but not the size, so an oversized thumbnail rendered in the picker and then
 * failed on save, which looked to the reader like a photo that simply would not
 * save. Whatever passes here is displayable and storable, by construction.
 */
export function storablePhoto(bytes: Uint8Array): ImageInfo | null {
  if (bytes.byteLength === 0 || bytes.byteLength > maxPhotoBytes) return null;
  const info = imageInfo(bytes);
  if (info === null) return null;
  return Math.max(info.width, info.height) > maxPhotoEdge ? null : info;
}
