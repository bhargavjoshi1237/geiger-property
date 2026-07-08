import {
  Image as ImageIcon,
  LayoutDashboard,
  UploadCloud,
  SquarePen,
  MapPin,
  Clock,
  Settings,
  Star,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { mediaData } from "@/lib/supabase/media";
import {
  OverviewSection,
  DetailsSection,
  SettingsSection,
  ActivitySection,
  MediaPlacementSection,
  MediaFileSection,
} from "@/components/internal/screens/entity/shared_sections";

// Per-area config for Property Photos & Media (row = one media asset). Shares the
// property.media table with the per-owner MediaSection galleries.

const STATUS_MAP = {
  Published: { label: "Published", variant: "success", dotClass: "bg-emerald-400" },
  Draft: { label: "Draft", variant: "neutral", dotClass: "bg-[#737373]" },
};

const KIND_OPTIONS = [
  { value: "photo", label: "Photo" },
  { value: "video", label: "Video" },
  { value: "360", label: "360° tour" },
  { value: "document", label: "Document" },
];

function formatBytes(n) {
  const b = Number(n) || 0;
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export const mediaConfig = {
  key: "media",
  singular: "Media",
  plural: "Media",
  title: "Property Photos & Media",
  description:
    "Your media library — photos, videos, and tours across the portfolio. Upload assets, place them on a property or unit, and set covers.",
  icon: ImageIcon,
  titleField: "name",
  searchFields: ["name", "kind"],
  data: mediaData,

  statusMap: STATUS_MAP,
  statusFilterOptions: [
    { value: "all", label: "All statuses" },
    { value: "Published", label: "Published" },
    { value: "Draft", label: "Draft" },
  ],

  columns: [
    {
      key: "name",
      header: "Asset",
      render: (r) => (
        <div className="flex items-center gap-3">
          {r.url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={r.thumbUrl || r.url}
              alt=""
              className="h-9 w-12 shrink-0 rounded-md border border-border object-cover"
            />
          ) : (
            <span className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md border border-border bg-surface-card text-text-tertiary">
              <ImageIcon className="h-4 w-4" />
            </span>
          )}
          <span className="min-w-0 truncate font-medium text-foreground">{r.name}</span>
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
      header: "Kind",
      render: (r) => <Badge variant="neutral">{r.kind}</Badge>,
    },
    {
      key: "cover",
      header: "Cover",
      align: "right",
      className: "text-right",
      render: (r) =>
        r.isCover ? (
          <Star className="ml-auto h-4 w-4 fill-amber-300 text-amber-300" />
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
  ],

  stats: (rows) => {
    const published = rows.filter((r) => r.status === "Published").length;
    const photos = rows.filter((r) => r.kind === "photo").length;
    const covers = rows.filter((r) => r.isCover).length;
    return [
      { label: "Assets", value: String(rows.length), footer: `${published} published` },
      { label: "Published", value: String(published), footer: "Live" },
      { label: "Photos", value: String(photos), footer: "Image assets" },
      { label: "Covers", value: String(covers), footer: "Set as cover" },
    ];
  },

  createDraft: { name: "", kind: "photo", status: "Published" },
  createFields: [
    { key: "name", label: "Asset name", type: "text", placeholder: "e.g. Lobby — wide shot" },
    { key: "kind", label: "Kind", type: "select", options: KIND_OPTIONS },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Published", label: "Published" },
        { value: "Draft", label: "Draft" },
      ],
    },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    kind: draft.kind || "photo",
    status: draft.status || "Published",
  }),

  detailFields: [
    { key: "name", label: "Asset name", type: "text", span: 2 },
    { key: "kind", label: "Kind", type: "select", options: KIND_OPTIONS },
  ],
  overviewStats: (item) => [
    { label: "Kind", value: item.kind || "—" },
    { label: "Cover", value: item.isCover ? "Yes" : "No" },
    { label: "Size", value: formatBytes(item.sizeBytes) },
    { label: "Status", value: item.status || "—" },
  ],

  headerMeta: (r) => [r.kind, r.isCover ? "Cover" : null].filter(Boolean).join(" · "),

  navGroups: [
    { group: null, items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A preview of this asset." }] },
    {
      group: "Media",
      items: [
        { key: "file", label: "File", icon: UploadCloud, desc: "Upload or replace the file." },
        { key: "details", label: "Details", icon: SquarePen, desc: "Name and kind." },
        { key: "placement", label: "Placement", icon: MapPin, desc: "Attach to a property or unit." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "activity", label: "Activity", icon: Clock, desc: "Recent changes and notes." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Status and configuration." },
      ],
    },
  ],
  sections: {
    overview: OverviewSection,
    file: MediaFileSection,
    details: DetailsSection,
    placement: MediaPlacementSection,
    activity: ActivitySection,
    settings: SettingsSection,
  },
};

export default mediaConfig;
