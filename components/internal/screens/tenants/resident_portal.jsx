"use client";

import {
  LayoutDashboard,
  Smartphone,
  Activity as ActivityIcon,
  Settings,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { tenantsData } from "@/lib/supabase/tenants";
import {
  makeFieldsSection,
  makeOverviewSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  TENANT_STATUS_MAP,
  TENANT_STATUS_FILTER_OPTIONS,
  formatDate,
} from "./shared";
import { ResidentPortalSection } from "./sections/resident_portal";
import { ActivitySection } from "./sections/activity";

// Resident Portal — a portal-management lens on the shared `tenants` table.
// Surfaces portal access and last-seen; the editor toggles access per resident.

const PORTAL_SETTINGS_FIELDS = [
  { key: "portalPushEnabled", label: "Push notifications", type: "switch", meta: true },
  { key: "portalPaymentsEnabled", label: "Online payments", type: "switch", meta: true },
  { key: "portalMaintenanceEnabled", label: "Maintenance requests", type: "switch", meta: true },
  { key: "portalNotes", label: "Notes", type: "textarea", meta: true, placeholder: "Portal notes…" },
];

const portalConfig = {
  key: "tenant",
  singular: "Resident",
  plural: "Residents",
  title: "Resident Portal",
  description:
    "Manage resident portal access across your tenants — who can sign in, what they can do, and when they last visited.",
  icon: Smartphone,
  titleField: "name",
  searchFields: ["name", "email", "unit"],
  data: tenantsData,

  statusMap: TENANT_STATUS_MAP,
  statusFilterOptions: TENANT_STATUS_FILTER_OPTIONS,

  columns: [
    {
      key: "name",
      header: "Resident",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.unit || "—"}</span>
        </div>
      ),
    },
    {
      key: "portalEnabled",
      header: "Portal",
      render: (r) =>
        r.portalEnabled ? (
          <Badge variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Enabled
          </Badge>
        ) : (
          <Badge variant="neutral">
            <span className="h-1.5 w-1.5 rounded-full bg-[#737373]" /> Disabled
          </Badge>
        ),
    },
    {
      key: "portalLastSeen",
      header: "Last seen",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => (r.portalLastSeen ? formatDate(r.portalLastSeen) : "Never"),
    },
  ],

  stats: (rows) => {
    const enabled = rows.filter((r) => r.portalEnabled).length;
    const active = rows.filter((r) => r.portalLastSeen).length;
    return [
      { label: "Residents", value: String(rows.length), footer: "Portal-eligible" },
      { label: "Portal enabled", value: String(enabled), footer: "Can sign in" },
      { label: "Have signed in", value: String(active), footer: "Seen at least once" },
      { label: "Disabled", value: String(rows.length - enabled), footer: "No access" },
    ];
  },

  createDraft: { name: "", email: "", status: "Current" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "name@example.com" },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email || "",
    unit: "",
    status: "Current",
    balance: 0,
    portalEnabled: false,
  }),

  headerMeta: (r) =>
    [r.unit, r.portalEnabled ? "Portal enabled" : "Portal disabled"]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Portal status for this resident." },
      ],
    },
    {
      group: "Portal",
      items: [
        { key: "access", label: "Access & Invite", icon: Smartphone, desc: "Enable or disable portal sign-in." },
        { key: "portalActivity", label: "Portal Activity", icon: ActivityIcon, desc: "Recent portal messages and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "What the resident can do in the portal." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "email", label: "Email" },
        { key: "unit", label: "Unit" },
        { key: "portalEnabled", label: "Portal", format: (v) => (v ? "Enabled" : "Disabled") },
        { key: "portalLastSeen", label: "Last seen", format: (v) => (v ? formatDate(v) : "Never") },
      ],
    }),
    access: ResidentPortalSection,
    portalActivity: ActivitySection,
    settings: makeFieldsSection(PORTAL_SETTINGS_FIELDS),
  },
};

export function ResidentPortalScreen() {
  return <EntityListScreen config={portalConfig} />;
}

export default ResidentPortalScreen;
