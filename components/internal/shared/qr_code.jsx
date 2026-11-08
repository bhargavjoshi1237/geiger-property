"use client";

import { useMemo } from "react";

import { qrMatrix, qrPath } from "@/lib/qr";

// QR code as an inline SVG. Always dark modules on white: scanners need the contrast whatever the theme.
export function QrCode({ value, size = 128, label = "QR code" }) {
  const matrix = useMemo(() => qrMatrix(value), [value]);
  if (!matrix) return null;
  const n = matrix.length + 8;
  return (
    <svg viewBox={`0 0 ${n} ${n}`} width={size} height={size} role="img" aria-label={label} shapeRendering="crispEdges" className="shrink-0 rounded-md bg-white text-black">
      <path d={qrPath(matrix)} fill="currentColor" />
    </svg>
  );
}

// A standalone SVG file of the code, for printing on signs and flyers.
export function qrSvgDataUrl(value) {
  const matrix = qrMatrix(value);
  if (!matrix) return "";
  const n = matrix.length + 8;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="white"/><path d="${qrPath(matrix)}" fill="black"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
