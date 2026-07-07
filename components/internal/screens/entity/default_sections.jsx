"use client";

import { LayoutDashboard, SquarePen, FileText, Clock, Settings } from "lucide-react";

// The shared starter section set every Entity area gets on the right-hand nav.
// This file owns the labels/icons/grouping/descriptions; each area maps these
// same keys to its OWN section component files (so real content can diverge per
// area later). `{entity}` in a description is replaced with the area's singular.
export const DEFAULT_SECTION_META = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboard,
    group: null,
    desc: "A snapshot of this {entity} — key details at a glance.",
  },
  {
    key: "details",
    label: "Details",
    icon: SquarePen,
    group: "General",
    desc: "Core fields and information for this {entity}.",
    ownHeader: false,
  },
  {
    key: "documents",
    label: "Documents",
    icon: FileText,
    group: "General",
    desc: "Files, paperwork, and attachments for this {entity}.",
  },
  {
    key: "activity",
    label: "Activity",
    icon: Clock,
    group: "General",
    desc: "Recent changes and history on this {entity}.",
  },
  {
    key: "settings",
    label: "Settings",
    icon: Settings,
    group: "General",
    desc: "Preferences and configuration for this {entity}.",
  },
];

export const DEFAULT_SECTION_KEYS = DEFAULT_SECTION_META.map((s) => s.key);

// Build the grouped NAV_GROUPS the editor's right-hand list renders, with the
// singular entity name woven into each description.
export function buildNavGroups(singular) {
  const s = String(singular || "record").toLowerCase();
  const groups = [];
  const byGroup = new Map();

  for (const meta of DEFAULT_SECTION_META) {
    const item = {
      key: meta.key,
      label: meta.label,
      icon: meta.icon,
      desc: meta.desc.replaceAll("{entity}", s),
      ownHeader: meta.ownHeader,
    };
    if (!byGroup.has(meta.group)) {
      const group = { group: meta.group, items: [] };
      byGroup.set(meta.group, group);
      groups.push(group);
    }
    byGroup.get(meta.group).items.push(item);
  }
  return groups;
}
