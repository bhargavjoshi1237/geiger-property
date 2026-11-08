"use client";

import { callApi } from "@/lib/messaging/api";

// Browser call for the accounting export route; never throws, { ok:false, error } on failure.
export const requestAccountingExport = (input) => callApi("/api/accounting/export", { body: input });

// Hand a file's text to the browser as a download.
export function saveTextFile(filename, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
