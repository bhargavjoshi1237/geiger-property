// Playground sandbox switch. While on, createClient() serves table reads/writes and
// storage from an in-memory store (see sandbox_client.js) so the landing-page
// playground can run every real screen without touching the database. It is
// pinned to the page that enabled it, so navigating into the real workspace
// switches it off without relying on unmount timing (Strict Mode remounts).

let sandboxPath = null;

const currentPath = () => (typeof window === "undefined" ? null : window.location.pathname);

export function isSandbox() {
  return sandboxPath !== null && currentPath() === sandboxPath;
}

export function enableSandbox() {
  sandboxPath = currentPath();
}
