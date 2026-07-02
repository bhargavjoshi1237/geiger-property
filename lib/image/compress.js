"use client";

// Reusable, dependency-free image compression. Mirrors the suite's canvas
// approach (draw to a canvas, re-encode as JPEG) but loops — progressively
// lowering quality and, if needed, scale — until the result is under a target
// size. Browser-only (uses canvas/Image); guard before calling on the server.
//
//   import { compressImageUnder } from "@/lib/image/compress";
//   const small = await compressImageUnder(file, 500); // <= 500 KB

const DEFAULTS = {
  maxKB: 500,
  maxWidth: 2000, // hero images never need to be wider than this
  maxHeight: 2000,
  minQuality: 0.4,
  mimeType: "image/jpeg",
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), type, quality),
  );
}

function fitWithin(w, h, maxW, maxH) {
  const ratio = Math.min(1, maxW / w, maxH / h);
  return { w: Math.max(1, Math.round(w * ratio)), h: Math.max(1, Math.round(h * ratio)) };
}

function renamedToExt(name, ext) {
  const base = (name || "image").replace(/\.[^.]+$/, "");
  return `${base}.${ext}`;
}

/**
 * Compress `file` to at most `maxKB` kilobytes. Returns a new File (JPEG) on
 * success, or the original file if it's already small enough or anything fails
 * (so the caller can always proceed to upload).
 */
export async function compressImageUnder(file, maxKB = DEFAULTS.maxKB, options = {}) {
  const opts = { ...DEFAULTS, maxKB, ...options };
  const limitBytes = opts.maxKB * 1024;

  if (typeof window === "undefined" || !file) return file;
  // Already small enough and not an oversized format → keep as-is.
  if (file.size <= limitBytes && file.type !== "image/png") return file;

  try {
    const img = await loadImage(file);
    let { w, h } = fitWithin(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      opts.maxWidth,
      opts.maxHeight,
    );

    // Up to a few passes: shrink quality first, then dimensions.
    let quality = 0.92;
    let best = null;

    for (let attempt = 0; attempt < 8; attempt += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      const blob = await canvasToBlob(canvas, opts.mimeType, quality);
      if (!blob) break;
      best = blob;
      if (blob.size <= limitBytes) break;

      if (quality > opts.minQuality) {
        quality = Math.max(opts.minQuality, quality - 0.15);
      } else {
        // Quality floor reached — scale the dimensions down and reset quality.
        w = Math.round(w * 0.8);
        h = Math.round(h * 0.8);
        quality = 0.8;
        if (w < 200 || h < 200) break;
      }
    }

    if (!best) return file;
    return new File([best], renamedToExt(file.name, "jpg"), {
      type: opts.mimeType,
      lastModified: Date.now(),
    });
  } catch {
    return file;
  }
}

export function fileSizeLabel(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
