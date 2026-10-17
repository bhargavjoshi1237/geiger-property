import {
  Image as ImageIcon,
  LayoutDashboard,
  UploadCloud,
  SquarePen,
  MapPin,
  Clock,
  Settings,
  Star,
  Megaphone,
  ShieldCheck,
  Waypoints,
  StickyNote,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { mediaData } from "@/lib/supabase/media";
import {
  OverviewSection,
  SettingsSection,
  ActivitySection,
  MediaPlacementSection,
  MediaFileSection,
} from "@/components/internal/screens/entity/shared_sections";
import { OWNER_TYPE_LABEL } from "@/components/internal/screens/entity/shared_sections/entity_options";
import { makeFieldsSection, makeNotesSection } from "@/components/internal/screens/entity/sections/factories";
import { MediaUsageSection } from "./sections/usage";

// Per-area config for the Media Library (row = one media asset). Shares the
// property.media table with the per-owner MediaSection galleries.

const STATUS_MAP = {
  Published: { label: "Published", variant: "success" },
  Draft: { label: "Draft", variant: "neutral" },
  Archived: { label: "Archived", variant: "outline" },
};

const KIND_OPTIONS = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "360", label: "360° tour" },
  { value: "floorplan", label: "Floor plan" },
  { value: "document", label: "Document" },
];
const KIND_LABEL = Object.fromEntries(KIND_OPTIONS.map((k) => [k.value, k.label]));

const opts = (labels) => labels.map((l) => ({ value: l, label: l }));
const TAG_OPTIONS = opts(["Exterior", "Interior", "Kitchen", "Bathroom", "Bedroom", "Living", "Amenity", "Aerial", "Neighborhood", "Lobby", "Model unit", "Hero"]);
const CHANNEL_OPTIONS = opts(["Website", "Listings / ILS", "Resident portal", "Social", "Print", "Owner reports"]);

function formatBytes(n) {
  const b = Number(n) || 0;
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

const licensed = (m) => ["Licensed", "Stock"].includes(m.license);

const DETAIL_FIELDS = [
  { key: "name", label: "Asset name", type: "text", required: true },
  { key: "kind", label: "Kind", type: "select", options: KIND_OPTIONS },
  { key: "altText", label: "Alt text", type: "text", meta: true, full: true, hint: "Describes the image for screen readers and SEO." },
  { key: "caption", label: "Caption", type: "textarea", meta: true },
  { key: "tags", label: "Tags", type: "multiselect", options: TAG_OPTIONS, meta: true },
  { key: "sort", label: "Display order", type: "number", min: 0, hint: "Lower shows first in galleries." },
  { key: "takenOn", label: "Taken on", type: "date", meta: true },
  { key: "credit", label: "Photographer / credit", type: "text", meta: true },
  { key: "externalUrl", label: "External link (video / tour)", type: "url", meta: true, showIf: (m) => ["video", "360"].includes(m.kind) },
];

const PUBLISHING_FIELDS = [
  { key: "status", label: "Status", type: "select", options: Object.keys(STATUS_MAP).map((k) => ({ value: k, label: k })) },
  { key: "featured", label: "Hero / featured image", type: "switch", meta: true },
  { key: "channels", label: "Channels", type: "multiselect", options: CHANNEL_OPTIONS, meta: true },
  { key: "publishOn", label: "Publish on", type: "date", meta: true },
  { key: "unpublishOn", label: "Unpublish on", type: "date", meta: true },
  { key: "watermark", label: "Apply watermark on export", type: "switch", meta: true },
];

const RIGHTS_FIELDS = [
  { key: "license", label: "Ownership", type: "select", meta: true, options: opts(["Owned", "Licensed", "Stock", "Tenant-submitted"]) },
  { key: "licenseExpires", label: "License expires", type: "date", meta: true, showIf: licensed },
  { key: "licenseSource", label: "Source / vendor", type: "text", meta: true, showIf: licensed },
  { key: "attributionRequired", label: "Attribution required", type: "switch", meta: true },
  { key: "releaseOnFile", label: "Model / property release on file", type: "switch", meta: true },
  { key: "usageRestrictions", label: "Usage restrictions", type: "textarea", meta: true },
];

export const mediaConfig = {
  key: "media",
  singular: "Media",
  plural: "Media",
  title: "Media Library",
  description:
    "Your media library — photos, videos and tours across the portfolio. Upload assets, tag and caption them, place them on a record, and control where they publish.",
  icon: ImageIcon,
  titleField: "name",
  searchFields: ["name", "kind", "altText", "caption", "credit"],
  data: mediaData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [{ value: "all", label: "All statuses" }, ...Object.keys(STATUS_MAP).map((k) => ({ value: k, label: k }))],

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "photos", label: "Photos", filter: (r) => r.kind === "photo", createDefaults: { kind: "photo" } },
    { value: "video", label: "Video & tours", filter: (r) => ["video", "360"].includes(r.kind) },
    { value: "unassigned", label: "Unassigned", filter: (r) => !r.ownerId },
    { value: "noalt", label: "Missing alt text", filter: (r) => r.kind === "photo" && !r.altText },
  ],

  columns: [
    {
      key: "name",
      header: "Asset",
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img src={r.thumbUrl || r.url} alt={r.altText || ""} className="h-9 w-12 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card text-text-tertiary">
              <ImageIcon className="h-4 w-4" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="flex items-center gap-1.5 truncate font-medium text-foreground">
              {r.name}
              {r.isCover ? <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500 dark:fill-amber-300 dark:text-amber-300" /> : null}
            </span>
            <span className="truncate text-xs text-text-secondary">{r.altText || "No alt text"}</span>
          </div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={STATUS_MAP} />,
    },
    {
      key: "kind",
      header: "Kind · Tags",
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge variant="neutral">{KIND_LABEL[r.kind] || r.kind}</Badge>
          {(Array.isArray(r.tags) ? r.tags : []).slice(0, 2).map((t) => (
            <Badge key={t} variant="neutral">
              {t}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      key: "placement",
      header: "Placed on",
      className: "text-sm text-muted-foreground",
      render: (r) => (r.ownerType ? OWNER_TYPE_LABEL[r.ownerType] || r.ownerType : "Library"),
    },
    {
      key: "size",
      header: "Size",
      align: "right",
      className: "text-right tabular-nums text-sm text-muted-foreground",
      render: (r) => formatBytes(r.sizeBytes),
    },
  ],

  stats: (rows) => {
    const published = rows.filter((r) => r.status === "Published").length;
    const unassigned = rows.filter((r) => !r.ownerId).length;
    const noAlt = rows.filter((r) => r.kind === "photo" && !r.altText).length;
    const bytes = rows.reduce((s, r) => s + (Number(r.sizeBytes) || 0), 0);
    return [
      { label: "Assets", value: String(rows.length), footer: `${published} published` },
      { label: "Unassigned", value: String(unassigned), footer: "Not placed on a record" },
      { label: "Missing alt text", value: String(noAlt), footer: "Photos to caption" },
      { label: "Library size", value: formatBytes(bytes).replace(" ", ""), footer: "Total stored" },
    ];
  },

  createDraft: { name: "", kind: "photo", status: "Published" },
  createFields: [
    { key: "name", label: "Asset name", type: "text", placeholder: "e.g. Lobby — wide shot" },
    { key: "kind", label: "Kind", type: "select", options: KIND_OPTIONS },
    { key: "status", label: "Status", type: "select", options: Object.keys(STATUS_MAP).map((k) => ({ value: k, label: k })) },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    kind: draft.kind || "photo",
    status: draft.status || "Published",
  }),

  detailFields: [
    { key: "name", label: "Asset name", type: "text" },
    { key: "kind", label: "Kind", type: "select", options: KIND_OPTIONS },
    { key: "altText", label: "Alt text", type: "text" },
    { key: "credit", label: "Credit", type: "text" },
  ],
  overviewStats: (item) => [
    { label: "Kind", value: KIND_LABEL[item.kind] || item.kind || "—" },
    { label: "Cover", value: item.isCover ? "Yes" : "No" },
    { label: "Size", value: formatBytes(item.sizeBytes).replace(" ", "") },
    { label: "Status", value: item.status || "—" },
  ],

  headerMeta: (r) =>
    [KIND_LABEL[r.kind] || r.kind, r.ownerType ? `On ${OWNER_TYPE_LABEL[r.ownerType] || r.ownerType}` : "Unassigned", r.isCover ? "Cover" : null]
      .filter(Boolean)
      .join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A preview of this asset." }] },
    {
      group: "Media",
      items: [
        { key: "file", label: "File", icon: UploadCloud, desc: "Upload or replace the file." },
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, alt text, caption and tags." },
        { key: "placement", label: "Placement", icon: MapPin, desc: "Attach to a property, unit or building." },
        { key: "usage", label: "Usage", icon: Waypoints, desc: "Where this asset appears." },
      ],
    },
    {
      group: "Publishing",
      items: [
        { key: "publishing", label: "Publishing", icon: Megaphone, desc: "Status, channels and schedule." },
        { key: "rights", label: "Rights & Licensing", icon: ShieldCheck, desc: "Ownership, license and releases." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: OverviewSection,
    file: MediaFileSection,
    details: makeFieldsSection(DETAIL_FIELDS),
    placement: MediaPlacementSection,
    usage: MediaUsageSection,
    publishing: makeFieldsSection(PUBLISHING_FIELDS),
    rights: makeFieldsSection(RIGHTS_FIELDS),
    notes: makeNotesSection({ field: "mediaNotes", placeholder: "Internal notes about this asset…" }),
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default mediaConfig;
