import { publicBaseUrl } from "./checkout";

// Route helpers for /api/payments/* (server-only).

// Public base URL (NEXT_PUBLIC_APP_URL, else this request's origin + basePath).
export const requestBase = (request) => publicBaseUrl(new URL(request.url).origin);

// `url` only when it points back at this app (no open redirects), else null.
export function sameOriginUrl(request, url) {
  try {
    const target = new URL(url);
    const allowed = new Set([new URL(request.url).origin]);
    const env = process.env.NEXT_PUBLIC_APP_URL;
    if (env) allowed.add(new URL(env).origin);
    return allowed.has(target.origin) ? target.toString() : null;
  } catch {
    return null;
  }
}

// Staff checkout returns through the verify route, which fulfils then redirects back.
export const verifyReturnUrl = (request, back) =>
  `${requestBase(request)}/api/payments/verify?back=${encodeURIComponent(back)}`;

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

// Minimal standalone result page for payers opening an emailed link.
export function resultPage({ title, message, actionUrl = "", actionLabel = "" }, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light dark}
body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:Canvas;color:CanvasText}
main{max-width:420px;padding:32px 24px;text-align:center}
h1{font-size:20px;margin:0 0 8px}
p{opacity:.75;line-height:1.5;margin:0 0 20px}
a{display:inline-block;padding:10px 18px;border-radius:8px;border:1px solid currentColor;color:inherit;text-decoration:none;font-weight:600}
small{display:block;margin-top:28px;opacity:.5}
</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
${actionUrl ? `<a href="${escapeHtml(actionUrl)}">${escapeHtml(actionLabel || "Continue")}</a>` : ""}
<small>Geiger Property · Secure payments by Stripe</small></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}
