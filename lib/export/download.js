// Browser-only: save a Blob or text as a file download.
export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const downloadText = (filename, text, type = "text/csv;charset=utf-8") => downloadBlob(filename, new Blob([text], { type }));
