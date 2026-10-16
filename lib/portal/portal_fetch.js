"use client";

import { compressImageUnder } from "@/lib/image/compress";

// Browser helper for the portal's /api/portal/* routes: adds the basePath and the
// active membership header, never throws — resolves { ok:false, error } so the
// screens decide the toast.

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || "";

let activeMemberId = "";

export const setPortalMember = (id) => {
  activeMemberId = id || "";
};

export const portalUrl = (path) => `${BASE}${path}`;

export async function portalApi(path, { method = "GET", body, form } = {}) {
  try {
    const res = await fetch(portalUrl(path), {
      method,
      credentials: "same-origin",
      headers: {
        ...(activeMemberId ? { "x-portal-member": activeMemberId } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(form ? { body: form } : body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json?.ok === false) {
      return { ...json, ok: false, status: res.status, error: json?.error || `Request failed (${res.status})` };
    }
    return { ...json, ok: true, status: res.status };
  } catch (e) {
    console.error("[portal.api]", e);
    return { ok: false, status: 0, error: "Couldn't reach the server. Check your connection." };
  }
}

// Upload one file (images compressed first) → { ok, file: { url, name, size, type } }.
export async function portalUpload(file, purpose = "other") {
  if (!file) return { ok: false, error: "Choose a file." };
  let payload = file;
  if ((file.type || "").startsWith("image/")) {
    try {
      payload = await compressImageUnder(file, 800);
    } catch {
      payload = file;
    }
  }
  const form = new FormData();
  form.append("file", payload, payload.name || file.name);
  form.append("purpose", purpose);
  return portalApi("/api/portal/upload", { method: "POST", form });
}
