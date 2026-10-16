// Property's transactional-email catalog (isomorphic, plain data). Mirrors
// geiger-events: every notification names a geiger-dash template key
// (`property.*`), its audience, and whether a flow in this app already sends it
// (`live`). Per-project toggles live in settings key `notifications`.

export const NOTIFICATIONS_SETTING_KEY = "notifications";

export const EMAIL_GROUPS = [
  { key: "rent", label: "Rent & payments", desc: "Reminders, receipts, and late notices residents get about rent." },
  { key: "leasing", label: "Leases & renewals", desc: "Expiry heads-ups and renewal offers through the lease lifecycle." },
  { key: "maintenance", label: "Maintenance", desc: "Status updates on work orders residents and vendors care about." },
  { key: "communications", label: "Messages & announcements", desc: "Replies from your inbox, merged template sends, and broadcasts." },
  { key: "portals", label: "Portals & invites", desc: "Access invitations for the resident, owner, and vendor portals." },
  { key: "owners", label: "Owner reporting", desc: "Statements and reports that go out to property owners." },
  { key: "compliance", label: "Documents & compliance", desc: "Expiring insurance certificates, licenses, and compliance items." },
  { key: "team", label: "Team alerts", desc: "Internal alerts that go to your own team, not residents." },
];

export const EMAIL_NOTIFICATIONS = [
  {
    key: "rent_reminder",
    group: "rent",
    label: "Rent reminder",
    description: "Sent a few days before rent is due (Scheduled jobs → Rent reminders).",
    audience: "Tenant",
    template: "property.rent_reminder",
    live: true,
  },
  {
    key: "rent_receipt",
    group: "rent",
    label: "Payment receipt",
    description: "Confirms a rent payment was received and applied.",
    audience: "Tenant",
    template: "property.rent_receipt",
    live: false,
  },
  {
    key: "late_notice",
    group: "rent",
    label: "Late rent notice",
    description: "Goes out once rent is past the grace period, with any late fee.",
    audience: "Tenant",
    template: "property.late_notice",
    live: true,
  },
  {
    key: "lease_expiring",
    group: "leasing",
    label: "Lease expiring",
    description: "Heads-up to residents 60 and 30 days before the lease ends.",
    audience: "Tenant",
    template: "property.lease_expiring",
    live: true,
  },
  {
    key: "renewal_offer",
    group: "leasing",
    label: "Renewal offer",
    description: "The offered rent and term for a lease renewal.",
    audience: "Tenant",
    template: "property.renewal_offer",
    live: false,
  },
  {
    key: "work_order_update",
    group: "maintenance",
    label: "Work order update",
    description: "Status changes on a work order — scheduled, in progress, completed.",
    audience: "Tenant · Vendor",
    template: "property.work_order_update",
    live: false,
  },
  {
    key: "message",
    group: "communications",
    label: "Messages & template sends",
    description: "Staff replies from the Inbox, merged template sends, and automation emails.",
    audience: "Tenant · Owner · Vendor",
    template: "property.message",
    live: true,
  },
  {
    key: "announcement",
    group: "communications",
    label: "Announcements",
    description: "Broadcasts sent now or on a schedule from Announcements.",
    audience: "Tenant · Owner · Vendor",
    template: "property.announcement",
    live: true,
  },
  {
    key: "portal_invite",
    group: "portals",
    label: "Portal invitation",
    description: "The sign-up link for the resident, owner, or vendor portal.",
    audience: "Tenant · Owner · Vendor",
    template: "property.portal_invite",
    live: false,
  },
  {
    key: "owner_statement",
    group: "owners",
    label: "Owner statement",
    description: "The monthly owner statement with income, expenses, and distribution.",
    audience: "Owner",
    template: "property.owner_statement",
    live: false,
  },
  {
    key: "document_expiring",
    group: "compliance",
    label: "Document expiring",
    description: "Insurance certificates (COI), licenses, and compliance items nearing their end date.",
    audience: "Vendor · Tenant · Owner",
    template: "property.document_expiring",
    live: true,
  },
  {
    key: "staff_alerts",
    group: "team",
    label: "Team alerts",
    description: "Renewal windows, expiring documents, and automation notifications sent to your alert recipients.",
    audience: "Team",
    template: "property.message",
    live: true,
  },
];

export const EMAIL_NOTIFICATION_KEYS = EMAIL_NOTIFICATIONS.map((n) => n.key);

export const getNotification = (key) => EMAIL_NOTIFICATIONS.find((n) => n.key === key) || null;

export function notificationsInGroup(groupKey) {
  return EMAIL_NOTIFICATIONS.filter((n) => n.group === groupKey);
}

// Stored value of settings key `notifications` (toggles + reminder timing + alert recipients).
export const defaultNotificationConfig = () => ({
  enabled: true,
  types: Object.fromEntries(EMAIL_NOTIFICATION_KEYS.map((key) => [key, true])),
  alertEmails: [],
  replyTo: "",
  rentReminderDays: 3,
  leaseReminderDays: [60, 30],
  documentExpiryDays: 30,
  smsEnabled: false,
});

export const NOTIFICATION_DEFAULTS = defaultNotificationConfig();

export function isNotificationAllowed(config, key) {
  if (!config || typeof config !== "object") return true;
  if (config.enabled === false) return false;
  const types = config.types && typeof config.types === "object" ? config.types : {};
  return types[key] !== false;
}

// Merge a stored config over the defaults so missing keys read sensibly.
export function resolveNotificationConfig(stored) {
  const base = defaultNotificationConfig();
  if (!stored || typeof stored !== "object") return base;
  return { ...base, ...stored, types: { ...base.types, ...(stored.types || {}) } };
}
