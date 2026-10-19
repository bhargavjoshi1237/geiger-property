import {
  AtSign,
  CalendarClock,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Flame,
  Hash,
  Heart,
  Laugh,
  Lightbulb,
  PartyPopper,
  PhoneMissed,
  Presentation,
  ThumbsUp,
} from "lucide-react";

// Lookups and formatters for the Communications (chat) area. Plain config — no
// row data and no JSX.

export const PRESENCE = {
  online: { label: "Active", color: "#22c55e", variant: "success" },
  away: { label: "Away", color: "#f59e0b", variant: "warning" },
  dnd: { label: "Do not disturb", color: "#ef4444", variant: "danger" },
  offline: { label: "Offline", color: "#737373", variant: "neutral" },
};

// Contacts list status: presence, plus team members who haven't opened chat yet.
export const CONTACT_STATUS_MAP = {
  ...PRESENCE,
  pending: { label: "Not on chat yet", variant: "outline" },
};

export const PRESENCE_FILTER_OPTIONS = [
  { value: "all", label: "Everyone" },
  { value: "online", label: "Active" },
  { value: "away", label: "Away" },
  { value: "offline", label: "Offline" },
];

// Reactions are stored by key, rendered as tinted Lucide icons.
export const REACTIONS = [
  { key: "like", label: "Like", icon: ThumbsUp, colorClass: "text-sky-600 dark:text-sky-400" },
  { key: "love", label: "Love", icon: Heart, colorClass: "text-rose-600 dark:text-rose-400" },
  { key: "laugh", label: "Haha", icon: Laugh, colorClass: "text-amber-600 dark:text-amber-400" },
  { key: "celebrate", label: "Celebrate", icon: PartyPopper, colorClass: "text-fuchsia-600 dark:text-fuchsia-400" },
  { key: "insightful", label: "Insightful", icon: Lightbulb, colorClass: "text-yellow-600 dark:text-yellow-400" },
  { key: "fire", label: "Fire", icon: Flame, colorClass: "text-orange-600 dark:text-orange-400" },
];

export const REACTION_MAP = Object.fromEntries(REACTIONS.map((r) => [r.key, r]));

// Inbox notification types → label, icon and tone.
export const NOTIFICATION_TYPE_MAP = {
  mention: { label: "Mention", icon: AtSign, tone: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400" },
  channel_invite: { label: "Channel", icon: Hash, tone: "bg-violet-500/10 border-violet-500/20 text-violet-600 dark:text-violet-300" },
  missed_call: { label: "Missed call", icon: PhoneMissed, tone: "bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400" },
  scheduled_call: { label: "Scheduled call", icon: CalendarClock, tone: "bg-amber-500/10 border-amber-500/20 text-amber-600 dark:text-amber-400" },
  call_reminder: { label: "Reminder", icon: CalendarClock, tone: "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400" },
};

export const NOTIFICATION_FILTER_OPTIONS = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
];

export const FILE_KIND_META = {
  pdf: { label: "PDF", icon: FileText },
  image: { label: "Image", icon: FileImage },
  archive: { label: "Archive", icon: FileArchive },
  sheet: { label: "Spreadsheet", icon: FileSpreadsheet },
  slides: { label: "Slides", icon: Presentation },
  doc: { label: "Document", icon: FileText },
};

export const FILE_KIND_FILTER_OPTIONS = [
  { value: "all", label: "All types" },
  ...Object.entries(FILE_KIND_META).map(([value, meta]) => ({ value, label: meta.label })),
];

export const CALL_FILTER_OPTIONS = [
  { value: "all", label: "All calls" },
  { value: "missed", label: "Missed" },
  { value: "incoming", label: "Incoming" },
  { value: "outgoing", label: "Outgoing" },
];

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// --- formatters ------------------------------------------------------------

export function initials(name = "") {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

const toDate = (value) => (value ? new Date(value) : null);

// Short relative label: "now", "5m", "3h", "Yesterday", "4d", then a date.
export function fromNow(value) {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return "";
  const mins = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function clockTime(value) {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dateTime(value) {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Day separator label in a timeline: "Today", "Yesterday", or "Mon, Oct 12".
export function dayLabel(value) {
  const d = toDate(value);
  if (!d || Number.isNaN(d.getTime())) return "";
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function durationLabel(secs) {
  const s = Math.round(Number(secs) || 0);
  if (s < 60) return `${s}s`;
  const mins = Math.round(s / 60);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function formatSize(bytes = 0) {
  const kb = (Number(bytes) || 0) / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
