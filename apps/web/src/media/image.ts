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
    const blob = await canvasBlob(canvas);
    if (blob.size > 5 * 1024 * 1024) throw new Error("The processed image is still too large.");
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()));
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
