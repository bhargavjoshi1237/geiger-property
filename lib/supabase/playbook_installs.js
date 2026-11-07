"use client";

import { makeEntityData } from "./entity_factory";

// Data-access layer for installed playbooks (owns `property.playbook_installs`): the setup answers a playbook's
// workflows were generated from, its version and the automation ids it owns (ORCH-07).
export const playbookInstallsLayer = makeEntityData({
  table: "playbook_installs",
  tag: "playbookInstalls",
  order: { col: "installed_at", ascending: false },
  fields: [
    { key: "playbookKey", col: "playbook_key", type: "text" },
    { key: "version", col: "version", type: "number" },
    { key: "config", col: "config", type: "text" },
    { key: "status", col: "status", type: "text", default: "active" },
    { key: "automationIds", col: "automation_ids", type: "text" },
    { key: "installedBy", col: "installed_by", type: "uuid" },
    { key: "installedAt", col: "installed_at", type: "date" },
  ],
});

// Live installs (not removed), newest first.
export const listPlaybookInstalls = async () => {
  const rows = await playbookInstallsLayer.list();
  return rows === null ? null : rows.filter((r) => r.status !== "removed");
};
