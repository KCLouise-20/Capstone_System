"use client";

/**
 * Every image this app accepts (item photos — the only upload path there
 * is) gets compressed to WebP client-side before it's ever sent to the
 * server, so Storage never holds a multi-megabyte JPEG/PNG for what's
 * displayed as a small thumbnail almost everywhere it's used. Done in the
 * browser via <canvas> rather than a server-side library (e.g. sharp) —
 * this app has exactly one upload path, so a native dependency and its
 * build/deploy overhead isn't worth it for that; the canvas approach also
 * means the compression work happens on the uploader's device, not on
 * Vercel's serverless compute.
 */

const MAX_DIMENSION = 1600;
const QUALITY = 0.82;

/**
 * Downscales (if larger than MAX_DIMENSION on its longest side) and
 * re-encodes an image file as WebP. Falls back to returning the original
 * file untouched if the browser can't produce a WebP blob (very old
 * Safari/Firefox) or the input isn't a decodable image — a slightly larger
 * upload beats a broken one.
 */
export async function compressImageToWebP(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob: Blob | null = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", QUALITY));
    if (!blob) return file;

    const webpName = file.name.replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], webpName, { type: "image/webp" });
  } catch {
    return file;
  }
}
