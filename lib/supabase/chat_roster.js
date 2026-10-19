"use client";

import { teamMembersLayer } from "./team_members";

// The project's team as chat sees it: the emails on Settings → Team & Members.
// A chat contact whose email isn't here (and who hasn't opened this project's
// chat) is flagged "external". Returns null on failure so the caller leaves the
// roster unknown rather than treating everyone as external.
export async function listTeamRoster() {
  try {
    const rows = await teamMembersLayer.list();
    if (!rows) return null;
    return rows
      .filter((m) => m.email)
      .map((m) => ({ id: m.id, name: m.name || "", email: m.email.toLowerCase(), role: m.role || "", status: m.status || "" }));
  } catch (e) {
    console.error("[chat_roster.list]", e);
    return null;
  }
}
