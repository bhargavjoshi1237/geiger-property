// Workspace area — Communications (Inbox threads + messages, announcements +
// deliveries, message templates, tenant communication log), Documents & Media,
// Automations (workflows, record events, run history), Scheduled Reports,
// scheduled-job history, notification sends, the Notifications setting and
// activity timelines. Everything a cron could act on is seeded paused:
// workflows are switched off (Paused / Draft), report schedules are Paused, no
// announcement is Scheduled, the Notifications master switch is off, and the
// reminder jobs' finite dedupe keys are pre-claimed in notification_sends.
import {
  BUILT_IN_WORKFLOWS,
  RECORD_TYPES,
  recordTitle,
  stepDefaults,
  triggerDefaults,
  triggerRecordType,
} from "@/lib/automations/catalog";
import { renderMerge } from "@/lib/messaging/merge_fields";
import { buildMergeValues, daysBetween, formatMergeDate } from "@/lib/messaging/context";
import { effectivePolicies } from "@/lib/policies";
import { defaultNotificationConfig } from "@/lib/email/catalog";
import { getReport, resolveFilters, runReport } from "@/lib/reports/catalog";
import { loadServerSources } from "@/lib/reports/sources_server";
import { sectionsCsv } from "@/lib/reports/csv";
import { reportHtml } from "@/lib/reports/html";
import { periodKeyFor } from "@/lib/reports/schedule";

// Id groups owned by this area (120–139).
const G = {
  setting: 120, announcement: 121, delivery: 122, template: 123, comm: 124, thread: 125, message: 126,
  document: 127, tenantDocument: 128, media: 129, automation: 130, event: 131, run: 132, schedule: 133,
  reportRun: 134, jobRun: 135, send: 136, activity: 137, step: 138,
};

// Sandbox groups this area links to or patches (lib/sandbox/seed/*).
const SB = {
  portfolio: 2, property: 3, building: 4, unitType: 5, floorPlan: 6, amenity: 7, unit: 8, tenant: 9, lease: 10,
  owner: 11, vendor: 12, listing: 20, prospect: 21, application: 23, renewal: 30, move: 31, inspection: 32,
  deposit: 33, notice: 34, leaseTemplate: 35, workOrder: 40, pmSchedule: 41, announcement: 60,
  template: 61, comm: 62, document: 63, tenantDocument: 64, automation: 67, member: 68, activity: 70, media: 71,
};

// --- time ------------------------------------------------------------------

const DAY = 86400000;
const NOW = Date.now();
const pad = (n) => String(n).padStart(2, "0");
const iso = (ms) => new Date(ms).toISOString();
const ago = (min) => iso(NOW - min * 60000);
// Local wall-clock time n days from today (history: n < 0).
function at(days, hhmm = "10:00") {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(NOW + days * DAY);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}
const addSec = (t, s) => iso(Date.parse(t) + s * 1000);
const addMin = (t, m) => addSec(t, m * 60);
const addDays = (t, d) => addSec(t, d * 86400);
const ymd = (t) => String(t).slice(0, 10);
const shiftYmd = (d, n) => iso(Date.parse(`${d}T00:00:00Z`) + n * DAY).slice(0, 10);
const utc = (d, hhmm = "00:00", sec = 4) => `${d}T${hhmm}:${pad(sec)}.000Z`;
// The hourly automation runner pass after `t`.
const nextPass = (t, sec = 4) => iso(Math.ceil((Date.parse(t) + 1000) / 3600000) * 3600000 + sec * 1000);
const before = (t, limit) => Date.parse(t) < Date.parse(limit);
const TODAY = iso(NOW).slice(0, 10);
const monthKey = (n) => {
  const d = new Date(NOW);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
// Workflows and email were switched off moments before the seed was generated.
const PAUSE = ago(25);

// --- people & settings -------------------------------------------------------

const TEAM = {
  morgan: [1, "Morgan Ellis"], alex: [2, "Alex Rivera"], jordan: [3, "Jordan Lee"], dana: [4, "Dana Kowal"],
  carmen: [5, "Carmen Diaz"], tasha: [6, "Tasha Greene"], ben: [7, "Ben Alvarez"],
};
const emailOf = (name) => `${name.toLowerCase().replace(/\s+/g, ".")}@harborpine.example`;
const ALERT_EMAILS = ["alex.rivera@harborpine.example", "carmen.diaz@harborpine.example", "ops@harborpine.example"];

// Settings key `notifications`: master switch OFF (no job or workflow can email), toggles and timing kept realistic.
const NOTIFICATIONS = {
  ...defaultNotificationConfig(),
  enabled: false,
  types: { ...defaultNotificationConfig().types, portal_invite: false, work_order_update: false },
  alertEmails: ALERT_EMAILS,
  replyTo: "hello@harborpine.example",
  rentReminderDays: 3,
  leaseReminderDays: [60, 30],
  documentExpiryDays: 30,
};

const SMS_NOT_CONNECTED = "SMS provider not connected";

// Landing-page images the playground already uses (only real public URLs in the seed).
const IMG = [
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-00a586c62c8782e65c0a.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0ec1f3ba625f482c9dc3.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-85923e7fafe00c9c0d1f.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-8e2e88cff7f33224ddd7.jpg",
  "https://200rfrtp5x71tlmk.public.blob.vercel-storage.com/geiger-dash/cursor-assets/asset-0a66efa21dd4b7e6c526.jpg",
];

// Rows written by a teammate keep the default created_by stamp; system rows have none.
const by = (staff) => (staff ? {} : { created_by: null });
const preview = (text) => String(text || "").replace(/\s+/g, " ").trim().slice(0, 160);

// --- environment -----------------------------------------------------------

// In-memory stand-in for the service-role client over ctx rows, so the app's own
// merge-field and report loaders run unchanged against the seed dataset.
function memoryDb(ctx) {
  const from = (table) => {
    let rows = ctx.rows(table).filter((r) => !r.deleted_at);
    let max = Infinity;
    const cmp = (fn) => (c, v) => ((rows = rows.filter((r) => r[c] != null && fn(r[c], v))), q);
    const q = {
      select: () => q,
      order: () => q,
      or: () => q,
      not: () => q,
      eq: (c, v) => ((rows = rows.filter((r) => (c === "project_id" ? r[c] == null || r[c] === v : r[c] === v))), q),
      neq: (c, v) => ((rows = rows.filter((r) => r[c] !== v)), q),
      is: (c, v) => {
        if (v === null && c !== "project_id") rows = rows.filter((r) => r[c] == null);
        return q;
      },
      in: (c, vs) => ((rows = rows.filter((r) => vs.includes(r[c]))), q),
      gt: cmp((a, b) => a > b),
      gte: cmp((a, b) => a >= b),
      lt: cmp((a, b) => a < b),
      lte: cmp((a, b) => a <= b),
      limit: (n) => ((max = n), q),
      range: (a, b) => Promise.resolve({ data: rows.slice(a, b + 1), error: null }),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error: null }),
      single: () => Promise.resolve({ data: rows[0] ?? null, error: rows[0] ? null : { message: "not found" } }),
      then: (res, rej) => Promise.resolve({ data: rows.slice(0, max), error: null }).then(res, rej),
    };
    return q;
  };
  return { from, rpc: async () => ({ data: null, error: null }) };
}

function makeEnv(ctx) {
  const counters = {};
  const nid = (g) => ctx.sid(g, (counters[g] = (counters[g] || 0) + 1));
  // Id derived from a row's unique key, so re-running a regenerated seed upserts the same row.
  const taken = new Set();
  const hid = (g, key) => {
    let n = 2166136261;
    for (const ch of key) n = Math.imul(n ^ ch.codePointAt(0), 16777619) >>> 0;
    n = (n % 99999999) + 1;
    while (taken.has(`${g}:${n}`)) n = (n % 99999999) + 1;
    taken.add(`${g}:${n}`);
    return ctx.sid(g, n);
  };
  const sb = (g, n) => ctx.sid(g, n);
  const live = (table, g) => (n) => ctx.byId(table, sb(g, n));
  const member = (key) => ({ id: sb(SB.member, TEAM[key][0]), name: TEAM[key][1], email: emailOf(TEAM[key][1]), key });
  const db = memoryDb(ctx);
  const W = {
    ctx,
    db,
    nid,
    hid,
    sb,
    member,
    tenant: live("tenants", SB.tenant),
    lease: live("leases", SB.lease),
    unit: live("units", SB.unit),
    property: live("properties", SB.property),
    building: live("buildings", SB.building),
    owner: live("owners", SB.owner),
    vendor: live("vendors", SB.vendor),
    prospect: live("prospects", SB.prospect),
    application: live("applications", SB.application),
    move: live("moves", SB.move),
    workOrder: live("work_orders", SB.workOrder),
    tpl: (n) => sb(SB.template, n),
    ntpl: (n) => sb(G.template, n),
    // Merge values exactly as the server builds them (lib/messaging/context.js).
    values: async (refs, now, recipientName) =>
      (await buildMergeValues(db, { projectId: ctx.projectId, ...refs }, { now: new Date(now), recipientName })).values,
    setting: (key) => ctx.rows("settings").find((s) => s.key === key)?.value || null,
    // Side-effect sinks shared by automations, inbox and announcements.
    sends: [],
    push: (table, row) => ctx.rows(table).push(row),
  };
  // Timeline row in the activity table (owner_type = the screen's config key).
  W.log = (ownerType, ownerId, verb, summary, when, actor = null, metadata = {}) => {
    if (!ownerId) return;
    W.push("activity", {
      id: nid(G.activity),
      owner_type: ownerType,
      owner_id: ownerId,
      verb,
      summary,
      actor_id: actor?.id ?? null,
      actor_name: actor?.name ?? "",
      occurred_at: when,
      created_at: when,
      metadata,
    });
  };
  return W;
}

// Party view of a tenant / owner / vendor / prospect row (lib/messaging/threads.js loadParty).
const partyOf = (type, row) =>
  row && {
    type,
    id: row.id,
    name: row.name || "",
    email: row.email || "",
    phone: row.phone || "",
    leaseId: row.lease_id || null,
    propertyId: row.property_id || null,
    unitId: row.unit_id || null,
  };

// --- settings ----------------------------------------------------------------

function settings(W) {
  W.push("settings", { id: W.sb(G.setting, 1), key: "notifications", value: NOTIFICATIONS, created_at: at(-200, "09:30"), updated_at: PAUSE });
}

// --- message templates -------------------------------------------------------

// New templates: [n, name, category, channel, status, audience, subject, body]
const NEW_TEMPLATES = [
  [1, "Renewal reminder — 30 days left", "Renewals", "Email", "Active", "Tenants",
    "{{days_until_lease_end}} days left on your lease at {{property}}",
    "Hi {{tenant_first_name}},\n\nYour lease for {{unit}} ends on {{lease_end}}. If you haven't yet, you can review your renewal options and sign in the resident portal.\n\nPlanning to move on? Please give us written notice so we can book your move-out inspection.\n\n{{company_name}}"],
  [2, "Renewal accepted — next steps", "Renewals", "Portal", "Active", "Tenants",
    "Thanks for renewing at {{property}}",
    "Hi {{tenant_first_name}},\n\nThank you for renewing! Your new term continues from {{lease_end}} at {{rent}} per month. The countersigned agreement is in the Documents tab of your resident portal."],
  [3, "Payment plan confirmation", "Collections", "Email", "Active", "Tenants",
    "Your payment plan for {{unit}}",
    "Hi {{tenant_first_name}},\n\nThis confirms the payment plan we agreed for your balance of {{balance_due}} on {{unit}}. Late fees are paused while the plan is current, and your regular rent of {{rent}} is still due {{due_date}}.\n\nReply to this email if anything changes.\n\n{{company_name}}"],
  [4, "Final notice before legal action", "Collections", "Email", "Draft", "Tenants",
    "Final notice — balance of {{balance_due}} on {{unit}}",
    "Hi {{tenant_name}},\n\nDespite earlier reminders, your balance of {{balance_due}} remains unpaid. If it isn't paid or a payment plan agreed within 10 days, we'll refer the account for further action as allowed under your lease and state law.\n\n{{company_name}}"],
  [5, "Balance reminder — SMS", "Collections", "SMS", "Active", "Tenants", "",
    "Harbor & Pine: Hi {{tenant_first_name}}, {{unit}} has a balance of {{balance_due}}. Pay in the resident portal or reply to set up a plan. Reply STOP to opt out."],
  [6, "Urgent vendor dispatch", "Maintenance", "Email", "Active", "Vendors",
    "Urgent dispatch — {{unit}}",
    "Hi {{vendor_name}},\n\nWe have an urgent work order at {{unit}} ({{property_address}}, {{property_city}}). Please reply with your ETA — our maintenance lead will meet your crew on site.\n\n{{company_name}} Maintenance"],
  [7, "New resident — owner update", "Leasing", "Email", "Active", "Owners",
    "New resident at {{property}}",
    "Hi {{owner_name}},\n\nGood news — {{unit}} is now leased to {{tenant_name}} at {{rent}} per month from {{lease_start}}. The lease and move-in inspection are in your owner portal.\n\n{{company_name}}"],
  [8, "Annual inspection notice", "Maintenance", "Portal", "Archived", "Tenants",
    "Annual unit inspection at {{property}}",
    "Hi {{tenant_first_name}},\n\nWe'll be completing annual safety inspections at {{property}} next week. A technician will check smoke detectors, plumbing and HVAC filters in {{unit}}. You don't need to be home."],
];

function templates(W) {
  const rows = W.ctx.rows("message_templates");
  const audience = { 6: "Prospects" };
  rows.forEach((t, i) => {
    const n = i + 1;
    t.audience = audience[n] || "Tenants";
    t.created_at = at(-300 + n * 9, "11:00");
    // {{due_date}} is the *next* due date, so the overdue notice talks about the balance instead.
    if (n === 2) {
      t.category = "Collections";
      t.body = "Hi {{tenant_name}},\n\nOur records show a balance of {{balance_due}} on {{unit}} — this month's rent of {{rent}} hasn't been received. A late fee applies after the 5-day grace period. If you've already paid, please disregard this message, or reply to set up a payment plan.\n\nHarbor & Pine Residential";
    }
    if (n === 4) t.category = "Renewals";
    if (n === 6) t.body = "Harbor & Pine: You're confirmed to tour {{unit}}. Reply C to confirm or R to reschedule.";
  });
  for (const [n, name, category, channel, status, aud, subject, body] of NEW_TEMPLATES) {
    rows.push({
      id: W.ntpl(n), name, category, channel, status, audience: aud, subject, body,
      created_at: at(-160 + n * 12, "14:00"),
      metadata: n === 4 ? { activityNotes: "Waiting on counsel sign-off before this goes live." } : {},
    });
  }
}

// --- announcements -----------------------------------------------------------

// Announcements: [n, name, audience, property n, building n, channel, status, priority,
// sent [days, time] (Sent) | planned day (Draft), expires (days from today), sender, body, notes?].
// Nothing is Scheduled — the scheduled-announcements job would send it on its date.
const ANNOUNCEMENTS = [
  [1, "Fire alarm testing — Tower B", "Building tenants", 1, 2, "SMS", "Sent", "High", [-3, "10:30"], 1, "alex",
    "Harbor & Pine: fire alarms in Tower B will be tested Thursday 10am–noon. Expect short bursts of the alarm; no need to evacuate."],
  [2, "Pinecrest pool & courtyard closing for winter", "Property tenants", 2, null, "Email", "Sent", "Normal", [-16, "10:30"], -1, "jordan",
    "The Pinecrest pool and courtyard furniture close for the season this Sunday. The courtyard path stays open, and the pool reopens Memorial Day weekend."],
  [3, "Elevator out of service — Tower A", "Building tenants", 1, 1, "Portal", "Sent", "Urgent", [-1, "08:15"], 2, "ben",
    "The Tower A elevator is out of service while Vertical Lift replaces a door operator. Expected back in service within 48 hours. Need help with groceries or deliveries? Call the leasing office and we'll lend a hand."],
  [4, "Vendor invoices now go through the portal", "Vendors", null, null, "Email", "Sent", "Normal", [-20, "10:30"], 30, "carmen",
    "From November 1, please submit invoices through the vendor portal against each work order. Invoices submitted there are approved and paid faster — no more emailed PDFs."],
  [5, "New owner statement layout", "Owners", 2, null, "Portal", "Draft", "Low", null, null, "carmen",
    "Starting with the October statement, owner statements group income and expenses by property and show the management fee on its own line."],
  [6, "Water shut-off — Tower A, Thursday 9am–1pm", "Building tenants", 1, 1, "Email", "Draft", "High", 3, 4, "alex",
    "Rainier Plumbing will replace the main riser valve in Tower A on Thursday. Water will be off from 9am to 1pm. Please store water ahead of time and keep taps closed during the work.",
    "Window confirmed with Rainier Plumbing dispatch. Ready to schedule once the riser parts arrive."],
  [7, "Winter weather preparedness", "All tenants", null, null, "Email", "Draft", "Normal", 10, 130, "alex",
    "Cold weather is on the way. Keep thermostats at 55°F or higher, open sink cabinets on freezing nights, and report any loss of heat through the resident portal right away.",
    "Hold until the first frost warning, then schedule."],
  [8, "Parking lot resurfacing — Pinecrest Commons", "Property tenants", 2, null, "SMS", "Draft", "High", 18, 21, "jordan",
    "The Pinecrest lot will be resurfaced over two days. Vehicles must be moved to street parking by 7am on the first day. Towing will be enforced."],
  [9, "Holiday office hours", "All tenants", null, null, "Portal", "Draft", "Low", null, null, "dana",
    "Our leasing offices will close early on Dec 24 and stay closed Dec 25 and Jan 1. Emergency maintenance remains available 24/7."],
  [10, "Updated vendor insurance requirements", "Vendors", null, null, "Email", "Draft", "Normal", null, null, "carmen",
    "Starting next quarter, all vendors must carry $2M general liability coverage and name Harbor & Pine Residential as additional insured. Please send an updated certificate before your next job."],
  [11, "Rooftop deck reopening", "Property tenants", 1, null, "Portal", "Sent", "Normal", [-6, "09:00"], 24, "alex",
    "The rooftop deck at The Marlowe has reopened with new furniture and grills. Reservations for private events can be made through the resident portal."],
  [12, "Q3 owner statements available", "Owners", null, null, "Email", "Sent", "Normal", [-9, "08:00"], 51, "carmen",
    "Your Q3 owner statements and distribution summaries are ready in the owner portal. Reach out to your property manager with any questions."],
  [13, "Lobby renovation — phase 2 update", "Building tenants", 5, 5, "Email", "Sent", "High", [-12, "11:00"], 18, "alex",
    "Phase 2 of the Cascade Lofts lobby renovation begins next week. The main entrance will be closed; please use the Pine St side door. Mail and packages move to the temporary lockers by the elevator."],
  [14, "Pay rent online through the resident portal", "All tenants", null, null, "Portal", "Sent", "Normal", [-25, "10:00"], null, null,
    "You can now pay rent by ACH or card in the resident portal and set up autopay so you never miss a due date."],
];

function announcements(W) {
  const { ctx } = W;
  // The playground's own announcement rows (if any) are replaced by this set.
  const table = ctx.rows("announcements");
  const sandboxIds = W.sb(SB.announcement, 0).slice(0, -8);
  table.splice(0, table.length, ...table.filter((r) => !String(r.id).startsWith(sandboxIds)));
  const recipients = audienceResolver(W);
  for (const [n, name, audience, propN, bldN, channel, status, priority, when, expires, sender, body, notes] of ANNOUNCEMENTS) {
    const p = propN ? W.property(propN) : null;
    const b = bldN ? W.building(bldN) : null;
    const sentAt = Array.isArray(when) ? at(when[0], when[1]) : null;
    const planned = sentAt ? ymd(sentAt) : when == null ? null : shiftYmd(TODAY, when);
    const actor = sender ? W.member(sender) : null;
    const a = {
      id: W.sb(G.announcement, n), name, audience, channel, status, priority, body,
      property_id: p?.id ?? null, property_name: p?.name ?? "",
      building_id: b?.id ?? null, building_name: b?.name ?? "",
      scheduled_for: planned,
      publish_on: planned,
      expires_on: expires == null ? null : shiftYmd(TODAY, expires),
      created_at: sentAt ? addMin(sentAt, -95 - n * 7) : at(-2 - n, "15:20"),
      metadata: notes ? { activityNotes: notes } : {},
    };
    table.push(a);
    if (sentAt) deliver(W, a, recipients(a), sentAt, actor);
    else W.log("announcement", a.id, "created", "Created announcement", a.created_at, actor || W.member("alex"));
  }
}

// Audience → recipients (lib/messaging/announcements.js resolveAudience) over sandbox people.
function audienceResolver(W) {
  const tenants = W.ctx.core.TENANTS.map((t) => W.tenant(Number(t.id.slice(-8)))).filter((t) => t && t.status !== "Past");
  const owners = W.ctx.core.OWNERS.map((o) => W.owner(Number(o.id.slice(-8)))).filter((o) => o && o.status !== "Inactive");
  const vendors = W.ctx.core.VENDORS.map((v) => W.vendor(Number(v.id.slice(-8)))).filter((v) => v && v.status !== "Inactive");
  const ownerProps = new Map(W.ctx.core.OWNERS.map((o) => [o.id, o.propertyIds]));
  const unitBuilding = (id) => W.ctx.byId("units", id)?.building_id || null;
  const as = (type) => (r) => ({ key: `${type}:${r.id}`, type, id: r.id, name: r.name, email: r.email || "", phone: r.phone || "" });
  return (a) => {
    if (a.audience === "Owners") return owners.filter((o) => !a.property_id || ownerProps.get(o.id)?.includes(a.property_id)).map(as("owner"));
    if (a.audience === "Vendors") return vendors.map(as("vendor"));
    if (a.audience === "Property tenants") return tenants.filter((t) => t.property_id === a.property_id).map(as("tenant"));
    if (a.audience === "Building tenants") return tenants.filter((t) => t.unit_id && unitBuilding(t.unit_id) === a.building_id).map(as("tenant"));
    return tenants.map(as("tenant"));
  };
}

// Per-recipient delivery rows + the announcement's delivery stats, as deliverAnnouncement stamps them.
function deliver(W, a, recipients, sentAt, actor) {
  const channel = String(a.channel || "Email").toLowerCase();
  const counts = { total: recipients.length, sent: 0, failed: 0, notSent: 0, skipped: 0, logged: 0 };
  const errors = [];
  recipients.forEach((r, i) => {
    let status = "sent";
    let error = null;
    if (channel === "portal") status = "logged";
    else if (channel === "sms") [status, error] = ["not_sent", SMS_NOT_CONNECTED];
    else if (a.name.startsWith("Pinecrest pool") && i === recipients.length - 1) [status, error] = ["failed", "550 5.1.1 Recipient address rejected"];
    const key = { sent: "sent", logged: "logged", not_sent: "notSent", failed: "failed" }[status];
    counts[key] += 1;
    if (error && errors.length < 20) errors.push(`${r.name || r.email}: ${error}`);
    W.push("announcement_deliveries", {
      id: W.nid(G.delivery),
      announcement_id: a.id,
      recipient_key: r.key,
      recipient_type: r.type,
      recipient_id: r.id,
      recipient_name: r.name,
      address: channel === "sms" ? r.phone : r.email,
      channel,
      status,
      error,
      sent_at: addSec(sentAt, i),
      created_at: addSec(sentAt, i),
      ...by(actor),
    });
  });
  const delivery = { ...counts, errors, at: sentAt };
  a.status = "Sent";
  a.sent_at = sentAt;
  a.metadata = { ...(a.metadata || {}), delivery, sentAt };
  W.log("announcement", a.id, "created", "Created announcement", a.created_at, actor || W.member("alex"));
  W.log("announcement", a.id, "sent",
    `Sent to ${counts.total} recipient${counts.total === 1 ? "" : "s"} — ${counts.sent} delivered, ${counts.notSent} not sent, ${counts.failed} failed`,
    addSec(sentAt, recipients.length + 1), actor || { id: null, name: "Scheduler" }, { system: true });
}

// --- automations ---------------------------------------------------------------

// Workflow specs in the builder's saved shape. `builtIn` starts from a gallery template
// (metadata.builtIn), `steps` are [type, config]; rules are [field, op, value?].
function workflowSpecs(W) {
  const { tpl, ntpl, member } = W;
  return [
    { key: "late", id: W.sb(SB.automation, 1), name: "Late rent notice & escalation", status: "Paused", created: -150,
      trigger: "rent.overdue", config: { daysOverdue: 6, minBalance: 100 },
      rules: [["balance", "gte", "100"], ["status", "not_equals", "Past"]],
      steps: [
        ["send_email", { recipient: "tenant", channel: "email", templateId: tpl(2) }],
        ["update_status", { status: "Late" }],
        ["wait", { days: 5 }],
        ["notify", { message: "{{tenant_name}} ({{unit}}) still owes {{balance_due}} — call today or serve a 14-day notice.", memberId: member("carmen").id, emailTeam: true }],
      ],
      canvas: "zigzag",
      meta: { description: "Six days after rent is due: emails the late notice, marks the resident Late, and escalates to accounting if the balance is still open five days later.", activityNotes: "Late-notice wording reviewed with counsel — matches the WA lease addendum." } },
    { key: "smsBalance", id: W.sb(SB.automation, 2), name: "Weekly balance text", status: "Paused", created: -60,
      trigger: "schedule", config: { frequency: "weekly", weekday: "1", scope: "tenants_with_balance" },
      rules: [["balance", "gt", "50"], ["balance", "lt", "5000"]],
      steps: [["send_email", { recipient: "tenant", channel: "sms", templateId: ntpl(5) }]],
      meta: { description: "Monday-morning text to every resident carrying a balance over $50.", activityNotes: "No SMS provider is connected yet — these texts are logged as not sent until one is." } },
    { key: "moveIn", id: W.sb(SB.automation, 3), builtIn: "move_in", status: "Paused", created: -120,
      rules: [["unit", "is_set"]], canvas: "column",
      meta: { description: "Welcome email, team heads-up, move-in inspection work order, and a first-week check-in.", activityNotes: "Jul run failed on the work-order step (RLS policy) — fixed Jul 20, later runs are clean." } },
    { key: "renewal", id: W.sb(SB.automation, 4), builtIn: "renewal", name: "Renewal outreach — 90 days", status: "Paused", created: -110,
      config: { daysBefore: 90 }, rules: [["rent", "lte", "5000"], ["term_end", "is_set"]], canvas: "split",
      meta: { description: "Opens the renewal conversation 90 days out (our Fees & Policies lead time) and follows up a month later." } },
    { key: "urgent", id: W.sb(SB.automation, 5), name: "Escalate urgent work orders", status: "Paused", created: -140,
      trigger: "work_order.created", rules: [["priority", "equals", "Urgent"], ["status", "not_equals", "Cancelled"]],
      steps: [
        ["notify", { message: "Urgent: {{unit}} — confirm the vendor is rolling and update the resident.", memberId: member("ben").id, emailTeam: true }],
        ["send_email", { recipient: "vendor", channel: "email", templateId: ntpl(6) }],
      ],
      meta: { description: "Pages the maintenance lead and dispatches the assigned vendor the moment an urgent work order is opened." } },
    { key: "appReceived", id: W.sb(SB.automation, 6), builtIn: "application_received", status: "Paused", created: -100,
      rules: [["status", "not_equals", "Draft"]],
      meta: { description: "Confirms receipt to the applicant and flags the application for screening." } },
    { key: "repair", id: W.sb(SB.automation, 7), builtIn: "repair_follow_up", name: "Post-repair satisfaction check", status: "Paused", created: -130,
      rules: [["category", "not_equals", "Cleaning"]],
      steps: [["wait", { days: 2 }], ["send_email", { recipient: "tenant", channel: "email", templateId: tpl(8) }]],
      meta: { description: "Two days after a work order closes, asks the resident whether everything is working.", activityNotes: "Paused while we switch email providers." } },
    { key: "moveOut", id: W.sb(SB.automation, 8), builtIn: "move_out", status: "Paused", created: -95,
      rules: [["kind", "equals", "out"]],
      meta: { description: "Move-out instructions, the move-out inspection work order, and a turn-planning alert." } },
    { key: "insurance", id: W.sb(SB.automation, 9), name: "Monthly renters-insurance reminder", status: "Draft", created: -20,
      trigger: "schedule", config: { frequency: "monthly", monthDay: 1, scope: "active_leases" },
      rules: [["status", "equals", "Active"]],
      steps: [
        ["send_email", { recipient: "tenant", channel: "email", subject: "Is your renters insurance current?", body: "Hi {{tenant_first_name}},\n\nYour lease for {{unit}} requires renters insurance with at least $100,000 liability coverage. If your policy renewed recently, please upload the new declarations page in the resident portal.\n\n{{company_name}}" }],
      ],
      meta: { description: "Draft — monthly nudge for every active lease. Waiting on the insurance compliance report to replace it." } },
    { key: "kickoff", id: W.sb(G.automation, 1), builtIn: "lease_kickoff", status: "Paused", created: -125,
      rules: [["deposit", "gt", "0"]],
      extraSteps: [["send_email", { recipient: "team", channel: "email", subject: "New lease: {{lease_name}}", body: "{{lease_name}} was created at {{rent}}/month starting {{lease_start}}.\n\nChecklist: collect the {{deposit}} deposit, confirm renters insurance, book the move-in inspection." }]],
      meta: { description: "Team checklist the moment a lease is added." } },
    { key: "ownerUpdate", id: W.sb(G.automation, 2), name: "Owner heads-up on new residents", status: "Paused", created: -115,
      trigger: "lease.activated", rules: [["rent", "gte", "1500"], ["tenant_name", "is_set"]],
      steps: [
        ["send_email", { recipient: "owner", channel: "email", templateId: ntpl(7) }],
        ["notify", { message: "{{lease_name}} is active — owner notified." }],
      ],
      meta: { description: "Lets the property owner know as soon as a new lease goes active." } },
    { key: "approved", id: W.sb(G.automation, 3), builtIn: "application_approved", status: "Paused", created: -45,
      rules: [["unit", "contains", "The Marlowe"]],
      meta: { description: "Next-steps email for approved applicants — Marlowe only while Pinecrest still uses the paper process." } },
    { key: "payment", id: W.sb(G.automation, 4), builtIn: "payment_thanks", status: "Paused", created: -80,
      rules: [["txn_type", "equals", "Income"], ["amount", "gt", "0"]],
      meta: { description: "Receipt-style thank-you with the remaining balance." } },
    { key: "roundup", id: W.sb(G.automation, 5), name: "Daily maintenance roundup", status: "Draft", created: -6,
      trigger: "schedule", config: { frequency: "daily", scope: "none" },
      steps: [
        ["notify", { message: "Daily roundup: review new requests and anything on hold in Work Orders.", emailTeam: true }],
        ["send_email", { recipient: "custom", channel: "email", email: "maintenance@harborpine.example", name: "Maintenance desk", subject: "Maintenance roundup — {{today}}", body: "Good morning — here's your reminder to triage new requests and follow up on anything on hold.\n\n{{company_name}}" }],
      ],
      meta: { description: "Draft — morning digest for the maintenance desk." } },
  ];
}

// Canvas node positions as the builder saves them (metadata.canvas.positions).
function canvasPositions(layout, rules, steps) {
  const ids = ["trigger", ...rules.map((r) => r.id), ...steps.map((s) => s.id)];
  const pos = {};
  ids.forEach((id, i) => {
    if (layout === "zigzag") pos[id] = { x: i % 2 ? 340 : 0, y: i * 150 };
    else if (layout === "split") pos[id] = id.startsWith("rule-") ? { x: 360, y: (i - 1) * 150 } : { x: 0, y: i * 150 };
    else pos[id] = { x: 0, y: i * 170 };
  });
  return { positions: pos };
}

function buildWorkflows(W) {
  return workflowSpecs(W).map((spec, wi) => {
    const tpl = spec.builtIn ? BUILT_IN_WORKFLOWS.find((t) => t.key === spec.builtIn) : null;
    const triggerEvent = spec.trigger || tpl.triggerEvent;
    const raw = spec.steps
      ? spec.steps.map(([type, config]) => ({ type, config }))
      : [...tpl.steps.map((s) => ({ type: s.type, config: s.config })), ...(spec.extraSteps || []).map(([type, config]) => ({ type, config }))];
    const steps = raw.map((s, i) => ({ id: W.sb(G.step, (wi + 1) * 10 + i + 1), type: s.type, config: { ...stepDefaults(s.type), ...s.config } }));
    const rules = (spec.rules || []).map(([field, op, value = ""], i) => ({ ...(spec.canvas ? { id: `rule-${i + 1}` } : {}), field, op, value }));
    const trigger = { ...triggerDefaults(triggerEvent), ...(tpl?.trigger || {}), ...(spec.config || {}) };
    const row = {
      id: spec.id,
      name: spec.name || tpl.name,
      trigger_event: triggerEvent,
      action_type: "workflow",
      enabled: false,
      status: spec.status,
      run_count: 0,
      last_run_on: null,
      trigger_rule: null,
      action_rule: null,
      audience: null,
      created_at: at(spec.created, "11:30"),
      updated_at: spec.status === "Paused" ? PAUSE : at(spec.created, "11:45"),
      metadata: {
        trigger,
        conditionRules: rules,
        steps,
        ...(spec.builtIn ? { builtIn: spec.builtIn } : {}),
        ...(spec.canvas ? { canvas: canvasPositions(spec.canvas, rules, steps) } : {}),
        ...spec.meta,
      },
    };
    return { ...spec, row, steps, rules, triggerEvent, recordType: triggerRecordType(triggerEvent, trigger) };
  });
}

// Merge refs for a triggering record (lib/automations/runner.js refsFor).
function refsFor(type, row) {
  if (!row) return {};
  const base = { unitId: row.unit_id, propertyId: row.property_id };
  if (type === "lease") return { ...base, leaseId: row.id, tenantId: row.tenant_id };
  if (type === "tenant") return { ...base, tenantId: row.id, leaseId: row.lease_id };
  if (type === "work_order") return { ...base, tenantId: row.tenant_id, vendorId: row.vendor_id, leaseId: row.lease_id };
  return { ...base, tenantId: row.tenant_id, leaseId: row.lease_id };
}

// Applications / moves only carry a unit label; resolve the unit row so merges and owners work.
function withUnit(W, row) {
  if (!row || row.unit_id) return row;
  const u = W.ctx.rows("units").find((x) => row.unit && String(row.unit).endsWith(` · ${x.label}`));
  return u ? { ...row, unit_id: u.id, property_id: row.property_id || u.property_id } : row;
}

async function automations(W) {
  const { ctx } = W;
  const flows = buildWorkflows(W);
  const byKey = Object.fromEntries(flows.map((f) => [f.key, f]));

  // Replace the sandbox's legacy-shaped rows (same ids), append the new ones.
  const table = ctx.rows("automations");
  for (const f of flows) {
    const i = table.findIndex((r) => r.id === f.row.id);
    if (i >= 0) table[i] = f.row;
    else table.push(f.row);
  }

  const templates = new Map(ctx.rows("message_templates").map((t) => [t.id, t]));
  const runs = [];
  const events = [];

  const event = (type, source, record, time, status, payload, extra = {}) => {
    const e = {
      id: W.nid(G.event),
      event_type: type,
      source_table: source,
      record_id: record.id,
      payload,
      status,
      attempts: 1,
      processed_at: extra.processedAt || nextPass(time, 2 + (events.length % 40)),
      error: extra.error || null,
      created_at: time,
      created_by: null,
      metadata: { runsStarted: extra.runs || 0 },
    };
    events.push(e);
    return e;
  };

  // Resolve one send_email recipient list (runner resolveRecipients).
  const recipientsFor = (c, refs, record) => {
    switch (c.recipient || "tenant") {
      case "tenant": return refs.tenantId ? [partyOf("tenant", ctx.byId("tenants", refs.tenantId))].filter(Boolean) : [];
      case "vendor": return refs.vendorId ? [partyOf("vendor", ctx.byId("vendors", refs.vendorId))].filter(Boolean) : [];
      case "owner": {
        const ids = ctx.core.OWNERS.filter((o) => o.propertyIds.includes(refs.propertyId)).map((o) => o.id);
        return ids.map((id) => partyOf("owner", ctx.byId("owners", id))).filter(Boolean);
      }
      case "applicant":
        return record?.email ? [{ type: "other", id: null, name: record.applicant_name || record.name || "", email: record.email, phone: record.phone || "" }] : [];
      case "team": return ALERT_EMAILS.map((email) => ({ type: "team", id: null, name: "", email }));
      case "custom": return c.email ? [{ type: "other", id: null, name: c.name || "", email: c.email }] : [];
      default: return [];
    }
  };

  // Execute a workflow against a record the way the runner would, recording the log and side effects.
  const simulate = async (f, { record = null, eventId = null, dedupeKey, start, failAt = null, failError = "" }) => {
    const runId = W.hid(G.run, `${f.row.id}|${dedupeKey}`);
    const type = f.recordType;
    const rec = withUnit(W, record);
    const refs = refsFor(type, rec);
    const recordLabel = rec ? recordTitle(type, rec) : null;
    const ownerType = RECORD_TYPES[type]?.ownerType;
    const log = [];
    let pass = start;
    let t = start;
    let values = await W.values(refs, pass);
    let status = "completed";
    let error = null;
    let current = f.steps.length;
    let finished = null;
    const actor = { id: null, name: f.row.name };

    for (let i = 0; i < f.steps.length; i += 1) {
      const s = f.steps[i];
      const c = s.config || {};
      t = addSec(t, 1);
      if (failAt === i) {
        if (s.type === "send_email") {
          for (const party of recipientsFor(c, refs, rec)) W.sends.push(await composeSend(W, { f, party, c, refs, at: t, runId, templates, status: "failed", error: failError }));
        }
        log.push({ step: i, type: s.type, status: "error", message: failError, at: t });
        [status, error, current, finished] = ["failed", failError, i, addSec(t, 1)];
        break;
      }
      if (s.type === "wait") {
        const days = Math.max(0, Number(c.days) || 0);
        const resume = addDays(pass, days);
        log.push({ step: i, type: "wait", status: "waiting", message: `Waiting ${days} day${days === 1 ? "" : "s"} — resumes ${ymd(resume)}`, at: t });
        // Still waiting when everything was paused → staff cancelled the run.
        if (!before(resume, PAUSE)) {
          [status, current, finished] = ["cancelled", i + 1, addMin(PAUSE, -3)];
          break;
        }
        pass = nextPass(resume, 6);
        t = pass;
        values = await W.values(refs, pass);
        continue;
      }
      if (s.type === "send_email") {
        const parties = recipientsFor(c, refs, rec);
        if (!parties.length) {
          log.push({ step: i, type: s.type, status: "warning", message: "No recipient with an address on file", at: t });
          continue;
        }
        const outcomes = [];
        for (const party of parties) {
          const send = await composeSend(W, { f, party, c, refs, at: t, runId, templates });
          outcomes.push(send);
          if (party.type !== "team") W.sends.push(send);
        }
        const warn = outcomes.some((o) => o.status !== "sent");
        const err = outcomes.find((o) => o.error)?.error;
        log.push({
          step: i, type: s.type, status: warn ? "warning" : "ok", at: t,
          message: `${outcomes.length} recipient${outcomes.length === 1 ? "" : "s"} — ${[...new Set(outcomes.map((o) => o.status))].join(", ")}${warn && err ? ` (${err})` : ""}`,
        });
        continue;
      }
      if (s.type === "notify") {
        const message = renderMerge(c.message, values, { keepMissing: false }) || `${f.row.name} ran`;
        if (ownerType && rec?.id) W.log(ownerType, rec.id, "automation", message, t, actor, { system: true, automationId: f.row.id, runId });
        const emails = new Set(c.emailTeam ? ALERT_EMAILS : []);
        if (c.memberId) emails.add(ctx.byId("team_members", c.memberId)?.email || "");
        emails.delete("");
        log.push({ step: i, type: s.type, status: "ok", at: t, message: emails.size ? `${message} (emailed ${emails.size}: sent)` : message });
        continue;
      }
      if (s.type === "create_work_order") {
        const name = renderMerge(c.name, values, { keepMissing: false }) || `${f.row.name} — ${recordLabel || "follow-up"}`;
        log.push({ step: i, type: s.type, status: "ok", at: t, message: `Created work order "${name}"` });
        continue;
      }
      if (s.type === "update_status") {
        log.push({ step: i, type: s.type, status: "ok", at: t, message: `Status set to ${c.status}` });
        if (ownerType && rec?.id) W.log(ownerType, rec.id, "updated", `Status set to ${c.status} by "${f.row.name}"`, t, actor, { system: true });
      }
    }
    const run = {
      id: runId,
      automation_id: f.row.id,
      automation_name: f.row.name,
      dedupe_key: dedupeKey,
      event_id: eventId,
      event_type: f.triggerEvent,
      record_type: type,
      record_id: rec?.id ?? null,
      record_label: recordLabel,
      status,
      current_step: current,
      resume_at: null,
      steps: f.steps,
      log,
      error,
      started_at: start,
      finished_at: finished || addSec(t, 1),
      created_at: start,
      created_by: null,
    };
    runs.push(run);
    f.row.run_count += 1;
    if (!f.row.last_run_on || ymd(start) > f.row.last_run_on) f.row.last_run_on = ymd(start);
    return run;
  };

  // Record-event trigger: the event, then (when it matches) the run started in that pass.
  const onEvent = async (f, source, record, time, payload, opts = {}) => {
    if (!record) return;
    if (f && before(time, f.row.created_at)) opts = { ignored: true };
    if (opts.skip || opts.ignored || opts.failed) {
      return event(f?.triggerEvent || opts.type, source, record, time, opts.ignored ? "ignored" : opts.failed ? "failed" : "processed", payload, {
        error: opts.failed || null,
        processedAt: opts.processedAt,
      });
    }
    const e = event(f.triggerEvent, source, record, time, "processed", payload, { runs: 1 });
    await simulate(f, { record, eventId: e.id, dedupeKey: `event:${e.id}`, start: e.processed_at, ...opts });
  };

  // When a record's date says "YYYY-MM-DD", the moment it was saved that day (local office hours).
  const onDay = (d, hhmm = "10:00") => at(daysBetween(TODAY, d), hhmm);
  const created = (row, fallback) => row?.created_at || fallback;

  // Rent overdue (timed): fires on the 7th (due day 1 + 6 days), once per tenant per month.
  for (const [month, tenants] of [[monthKey(-1), [6, 8]], [monthKey(0), [6, 8, 15]]]) {
    for (const [i, n] of tenants.entries()) {
      const t = W.tenant(n);
      const start = utc(`${month}-07`, "00:00", 5 + i);
      if (t && before(start, PAUSE)) await simulate(byKey.late, { record: t, dedupeKey: `rent.overdue:${t.id}:${month}`, start });
    }
  }

  // Weekly balance text (schedule, Mondays): tenants with a balance at the time.
  const mondays = [];
  for (let d = 0; d <= 24; d += 1) {
    const day = shiftYmd(TODAY, -d);
    if (new Date(`${day}T00:00:00Z`).getUTCDay() === 1 && before(utc(day), PAUSE)) mondays.push(day);
  }
  for (const day of mondays.reverse()) {
    const who = day >= shiftYmd(TODAY, -9) ? [6, 8, 15] : [6, 8];
    for (const [i, n] of who.entries()) {
      const t = W.tenant(n);
      if (t) await simulate(byKey.smsBalance, { record: t, dedupeKey: `schedule:${day}:${t.id}`, start: utc(day, "00:00", 7 + i) });
    }
  }

  // Move-in welcome (move_in.scheduled): scheduled two weeks before each move-in.
  const moveIn = [[8, -14, { failAt: 2, failError: 'new row violates row-level security policy for table "work_orders"' }], [7, -15], [5, -14], [1, null, { when: at(-5, "15:40") }], [3, null, { when: at(-1, "11:15") }]];
  for (const [n, offset, opts = {}] of moveIn) {
    const m = W.move(n);
    if (!m) continue;
    const when = opts.when || onDay(shiftYmd(m.move_date, offset), "16:20");
    await onEvent(byKey.moveIn, "moves", m, when, { status: "Scheduled", previousStatus: null }, { failAt: opts.failAt ?? null, failError: opts.failError || "" });
  }

  // Renewal outreach (lease.ending, timed): 90 days before the end date.
  for (const n of [13, 4, 3, 9]) {
    const l = W.lease(n);
    if (!l?.term_end) continue;
    const due = utc(shiftYmd(l.term_end, -90), "00:00", 9);
    const start = before(due, byKey.renewal.row.created_at) ? nextPass(byKey.renewal.row.created_at, 9) : due;
    if (before(start, PAUSE)) await simulate(byKey.renewal, { record: l, dedupeKey: `lease.ending:${l.id}:${l.term_end}`, start });
  }

  // Work order created → escalate urgent ones; the rest are processed without a run.
  for (const n of [12, 11, 10, 9, 8, 7, 5, 4, 1]) {
    const w = W.workOrder(n);
    if (!w || (w.kind || "work_order") !== "work_order") continue;
    const payload = { status: "Open", previousStatus: null };
    // WO1 was opened after everything was paused; a manual runner pass then ignored its event.
    if (n === 1) W.ignoredPass = (await onEvent(byKey.urgent, "work_orders", w, ago(18), payload, { ignored: true, processedAt: ago(10) })).processed_at;
    else if (n === 8) W.failedPass = (await onEvent(byKey.urgent, "work_orders", w, created(w, at(-9)), payload, { failed: "work_orders: canceling statement due to statement timeout" })).processed_at;
    else if (w.priority === "Urgent") await onEvent(byKey.urgent, "work_orders", w, created(w, at(-4)), payload);
    else await onEvent(byKey.urgent, "work_orders", w, created(w, at(-n)), payload, { skip: true });
  }

  // Work order completed → follow-up two days later (cleaning jobs are filtered out).
  for (const n of [12, 11, 10, 9]) {
    const w = W.workOrder(n);
    const done = w?.metadata?.completedAt;
    if (!w || !done) continue;
    const payload = { status: "Completed", previousStatus: "In progress" };
    await onEvent(byKey.repair, "work_orders", w, onDay(done, "15:30"), payload, { skip: w.category === "Cleaning" });
  }

  // Applications submitted → acknowledgement (Nadia's address bounced).
  for (const n of [8, 6, 7, 5, 4, 3, 2, 1]) {
    const a = W.application(n);
    if (!a) continue;
    const opts = n === 7 ? { failAt: 0, failError: "550 5.1.1 Recipient address rejected" } : {};
    await onEvent(byKey.appReceived, "applications", a, created(a, at(-n, "09:00")), { status: "Submitted", previousStatus: null }, opts);
  }

  // Application approved (Zoe).
  const zoeApp = W.application(6);
  if (zoeApp) await onEvent(byKey.approved, "applications", zoeApp, addDays(created(zoeApp, at(-20)), 2), { status: "Approved", previousStatus: "Screening" });

  // Move-outs scheduled.
  for (const [n, offset] of [[6, -35], [4, -86], [2, -29]]) {
    const m = W.move(n);
    if (m?.move_date) await onEvent(byKey.moveOut, "moves", m, onDay(shiftYmd(m.move_date, offset), "13:45"), { status: "Scheduled", previousStatus: null });
  }

  // Leases created → kickoff; lease activated → owner heads-up.
  for (const [n, offset] of [[5, -17], [15, -17], [10, -17], [16, -31], [17, -25]]) {
    const l = W.lease(n);
    if (l?.term_start) await onEvent(byKey.kickoff, "leases", l, onDay(shiftYmd(l.term_start, offset), "17:05"), { status: n === 17 ? "Draft" : "Pending", previousStatus: null });
  }
  const noah = W.lease(12);
  if (noah?.term_start) await onEvent(byKey.ownerUpdate, "leases", noah, onDay(noah.term_start, "09:10"), { status: "Active", previousStatus: "Pending" }, { ignored: true });
  for (const n of [5, 15, 10]) {
    const l = W.lease(n);
    if (l?.term_start) await onEvent(byKey.ownerUpdate, "leases", l, onDay(l.term_start, "09:10"), { status: "Active", previousStatus: "Pending" });
  }

  // Payment received → thank-you, for tenant-linked income the accounting area recorded.
  const dateOf = (x) => x.txn_date || x.transaction_date || x.posted_on || null;
  const payments = ctx.rows("transactions")
    .filter((x) => !x.deleted_at && (x.tenant_id || x.lease_id) && /^(income|payment|receipt)$/i.test(x.txn_type || x.kind || "") && dateOf(x) && before(onDay(dateOf(x), "12:00"), PAUSE))
    .sort((a, b) => String(dateOf(b)).localeCompare(String(dateOf(a))))
    .slice(0, 4);
  for (const x of payments) {
    const ok = byKey.payment.rules.every((r) => (r.op === "equals" ? String(x[r.field]).toLowerCase() === r.value.toLowerCase() : Number(x[r.field]) > Number(r.value)));
    await onEvent(byKey.payment, "transactions", x, onDay(dateOf(x), "12:00"), { status: x.status || "Cleared", previousStatus: null }, { skip: !ok });
  }

  for (const f of flows) if (f.row.status === "Paused" && !f.row.run_count) Object.assign(f.row, { status: "Draft", updated_at: f.row.created_at });
  events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  runs.sort((a, b) => a.started_at.localeCompare(b.started_at));
  ctx.rows("automation_events").push(...events);
  ctx.rows("automation_runs").push(...runs);
  W.runs = runs;
}

// One outbound message as sendPartyMessage composes it (template fallback, merge, delivery).
async function composeSend(W, { f, party, c, refs, at: when, runId, templates, status, error }) {
  const template = c.templateId ? templates.get(c.templateId) : null;
  const channel = String(c.channel || template?.channel || "email").toLowerCase();
  const partyRefs = {
    tenantId: party.type === "tenant" ? party.id : refs.tenantId,
    ownerId: party.type === "owner" ? party.id : undefined,
    vendorId: party.type === "vendor" ? party.id : refs.vendorId,
    leaseId: refs.leaseId || party.leaseId || undefined,
    unitId: refs.unitId || party.unitId || undefined,
    propertyId: refs.propertyId || party.propertyId || undefined,
  };
  const values = await W.values(partyRefs, when, party.name);
  const subject = renderMerge(c.subject || template?.subject || "", values, { keepMissing: false }).trim();
  const body = renderMerge(c.body || template?.body || "", values, { keepMissing: false });
  let delivery = status || "sent";
  let err = error || null;
  if (channel === "sms") [delivery, err] = ["not_sent", SMS_NOT_CONNECTED];
  else if (!party.email) [delivery, err] = ["failed", "No email address on file"];
  return {
    party, channel, subject: channel === "sms" ? "" : subject || "A message from your property team", body,
    status: delivery, error: err, at: when, templateId: template?.id || null,
    actor: { id: null, name: "Automation", email: "" }, metadata: { automationId: f.row.id, runId },
  };
}

// --- inbox -------------------------------------------------------------------------

// Hand-written conversations. Messages: [who, channel, when, body, opts] — who is "in"
// (the party), a team key (outbound from that teammate) or "note:<team key>".
function conversations(W) {
  const wo = (n, hhmmOffsetMin = 0) => addMin(W.workOrder(n)?.created_at || ago(600), hhmmOffsetMin);
  const coiEnd = W.vendor(6)?.insurance_expiry;
  return [
    { party: ["tenant", 6], absorbFrom: -20, read: false, msgs: [
      ["in", "email", at(-5, "19:12"), "Hi Carmen, I got the past-due notice. My hours were cut back in September and I can't cover the full $1,450 at once. Could I split it over a couple of months?"],
      ["carmen", "email", at(-4, "10:05"), "Hi Omar,\n\nThanks for telling us. We can set up a repayment plan: $500 with your November rent, then $475 in each of the following two months, on top of regular rent. Late fees stop while the plan is current. I'll send the agreement for e-signature shortly.\n\nCarmen Diaz\nHarbor & Pine Residential"],
      ["note:carmen", "note", at(-4, "10:12"), "Plan approved by Alex — three installments, late fees paused. E-sign request \"Repayment plan agreement — B-102\" goes out today."],
      ["in", "email", at(-2, "08:41"), "Thank you — I'll sign it tonight. Is it okay if the first installment comes out on the 3rd instead of the 1st? That's when I get paid."],
    ] },
    { party: ["tenant", 8], absorbFrom: -20, read: true, status: "Waiting", msgs: [
      ["note:alex", "note", at(-1, "16:58"), "Called Marcus — he'll pay $1,000 by Friday and the remaining $1,150 with November rent. Owner approved filing if it doesn't post; holding the eviction filing until then."],
      ["carmen", "sms", at(-1, "17:20"), "Hi Marcus, it's Carmen at Harbor & Pine. Confirming $1,000 by this Friday and the remaining $1,150 with your November rent. Thanks for working with us!"],
      ["carmen", "email", at(-1, "17:24"), null, { template: W.ntpl(3) }],
    ] },
    { party: ["tenant", 3], absorbFrom: -50, read: true, status: "Waiting", msgs: [
      ["tasha", "email", at(-5, "11:00"), "Hi Priya,\n\nWe'd love for you to stay at The Marlowe. Your renewal options for A-201:\n\n• 12 months at $1,995/month\n• 15 months at $1,975/month\n\nThe offer is open until Oct 30 — the e-signature link is in a separate email.\n\nTasha Greene\nLeasing, Harbor & Pine", { subject: "Your renewal offer for The Marlowe · A-201" }],
      ["in", "email", at(-3, "21:14"), "Thanks Tasha! I'm leaning toward the 12-month option. My new job's start date should be confirmed by Friday — can I give you a final answer then?"],
      ["tasha", "email", at(-2, "09:32"), "Of course, Priya — I've held the 12-month offer for you until Friday. Reply here or sign through the link whenever you're ready."],
    ] },
    { party: ["tenant", 2], channel: "portal", read: false, msgs: [
      ["in", "portal", wo(2, -2), "There's standing water in the bottom of the dishwasher after every cycle. I've already cleaned the filter. Could someone take a look?", { subject: "Dishwasher not draining", source: "portal" }],
      ["alex", "email", wo(2, 130), "Hi Daniel, thanks — we've logged the request and will book Summit Appliance as soon as it's approved. Do weekday mornings still work best?"],
      ["in", "portal", wo(2, 300), "Weekday mornings are perfect — I'm home Tuesday and Thursday.", { source: "portal" }],
    ] },
    { party: ["tenant", 7], channel: "portal", read: false, msgs: [
      ["in", "portal", wo(3, -3), "Hi, the bathroom exhaust fan has started rattling loudly whenever it runs. Could someone take a look this week?", { subject: "Bathroom fan is very loud", source: "portal", comm: 2 }],
      ["jordan", "email", wo(3, 1500), "Hi Grace — thanks for the heads-up. We're reviewing the request now; it's most likely the fan motor. I'll confirm a time with Brightline Electric shortly."],
      ["in", "portal", wo(3, 1680), "Thanks! After 5pm works best on weekdays.", { source: "portal" }],
    ] },
    { party: ["tenant", 13], absorbFrom: -50, read: true, status: "Waiting", msgs: [
      ["in", "email", at(-45, "16:20"), "Please accept this as my written notice — I'll be moving out when my lease ends on Nov 4. Can we schedule the move-out inspection?", { subject: "Notice to vacate — TH-3", comm: 4 }],
      ["jordan", "email", at(-44, "09:15"), "Hi Chloe, thanks for letting us know — we're sorry to see you go. I've noted your move-out for Nov 4 and we'll send instructions plus a pre-move-out walkthrough date soon. Could you send a forwarding address for your deposit?"],
      ["in", "email", at(-40, "18:02"), "Of course — it's 2214 W Riverside Ave, Spokane, WA 99201."],
      ["jordan", "email", at(-3, "14:30"), "Hi Chloe, thanks for meeting me for the walkthrough. Just minor nail holes and some carpet wear — nothing unexpected. Final walk is on Nov 4 once you're moved out; please leave keys and garage remotes on the kitchen counter."],
    ] },
    { party: ["tenant", 16], absorbFrom: -40, read: true, msgs: [
      ["tasha", "sms", at(-4, "13:00"), "Hi Zoe! Your keys for B-101 will be ready at the leasing office at 10am on move-in day. Text us if anything changes.", { comm: 5 }],
      ["in", "email", at(-3, "20:15"), "Hi Tasha, quick question before move-in — is there a covered parking stall available for B-101? Happy to add it to my lease.", { subject: "Parking at The Marlowe" }],
      ["tasha", "email", at(-2, "10:05"), "Hi Zoe — yes! Stall P-22 in the secured garage is available at $150/month. I'll add a parking addendum to your lease packet so you can sign everything together."],
    ] },
    { party: ["tenant", 15], channel: "portal", read: true, msgs: [
      ["in", "portal", at(-7, "19:00"), "I see a $650 balance but I paid on the 3rd. Can you check whether my payment went through?", { subject: "Question about my balance", source: "portal", comm: 8 }],
      ["carmen", "email", at(-6, "10:20"), "Hi Liam, I checked with the bank: your Oct 3 ACH payment of $650 was returned (R01 — insufficient funds), so the balance is still open. You can pay again in the portal — we've waived the returned-payment fee this once."],
      ["in", "portal", at(-6, "21:10"), "Ah, I switched accounts and forgot to update autopay. I'll pay it this week — thanks for waiving the fee.", { source: "portal" }],
      ["carmen", "email", at(-1, "11:00"), "Hi Liam, just a friendly reminder that $650 is still open on L-302. Let us know if you need a few more days.", { status: "failed", error: "550 5.2.2 Mailbox full" }],
    ] },
    { party: ["tenant", 1], read: true, status: "Closed", msgs: [
      ["in", "email", at(-11, "18:00"), "My locker code from the notification text isn't opening the locker. Could you reset it?", { subject: "Package locker code not working", comm: 10 }],
      ["ben", "email", at(-10, "09:10"), "Hi Maya, I've reset locker 14 — your new code is in the notification text we just sent. Let us know if it still sticks."],
      ["in", "email", at(-10, "12:40"), "Works now, thank you!"],
    ] },
    { party: ["tenant", 5], channel: "portal", read: true, status: "Closed", msgs: [
      ["in", "portal", at(-30, "20:15"), "Hi! We adopted a cat — Miso, 3 years old, spayed. What do I need to send over for the pet addendum?", { subject: "Registering our new cat", source: "portal" }],
      ["tasha", "email", at(-29, "10:00"), "Congrats on Miso! The pet addendum is a one-time $350 fee — I've sent it for e-signature. Please upload the vaccination record in the portal when you can."],
      ["in", "portal", at(-28, "18:30"), "Signed and uploaded. Thanks!", { source: "portal" }],
    ] },
    { party: ["tenant", 14], absorbFrom: -30, read: true, status: "Closed", msgs: [
      ["in", "email", at(-18, "19:30"), "All good — the fridge has been cold ever since. Thanks for the quick turnaround."],
    ] },
    { party: ["owner", 1], read: false, msgs: [
      ["in", "email", at(-6, "15:05"), "Hi Alex, the Q3 statement shows $2,000 for the lobby lighting retrofit. Is phase 2 still tracking to the $48k budget we approved? Also, could we get updated photos of the façade work for our board deck?", { subject: "Cascade Lofts lobby — phase 2 budget" }],
      ["alex", "email", at(-5, "09:40"), "Hi Rebecca, phase 2 is on budget — $21.6k committed so far, with the remaining scope (entrance doors and mailroom) bid at $24.8k. I've added the latest façade and lobby concept images to the Cascade Lofts property file in your owner portal."],
      ["in", "email", at(-1, "16:22"), "Perfect, thank you. One more thing: can the Q4 distribution go out by the 10th? We have a capital call on the 12th."],
    ] },
    { party: ["owner", 4], read: true, status: "Waiting", msgs: [
      ["dana", "email", at(-8, "10:00"), "Hi Jonathan, welcome aboard! To finish onboarding 14 Birchwood Lane we still need your signed management agreement and a W-9 for 1099 reporting. Both are in your owner portal under Documents.", { subject: "Management agreement & W-9" }],
      ["in", "email", at(-6, "20:45"), "Thanks Dana — I signed the agreement. The W-9 needs my accountant's input; I'll send it by the end of the month."],
      ["dana", "email", at(-5, "09:15"), "Got the signed agreement, thank you! No rush on the W-9 — anytime before December works."],
    ] },
    { party: ["owner", 2], channel: "portal", read: true, msgs: [
      ["in", "portal", at(-9, "11:30"), "We saw the roof report flags the North building gutters. Can you get two quotes before we approve anything?", { subject: "Gutter replacement — North building", source: "portal" }],
      ["jordan", "email", at(-8, "14:00"), "Absolutely — Cascade Landscaping and one other contractor are quoting this week. I'll post both estimates to your owner portal by Friday."],
    ] },
    { party: ["vendor", 1], absorbFrom: -5, read: false, msgs: [
      ["in", "email", wo(5, 380), "Mike here — crew is on site. Supply line replaced and water's back on at the stop. Ceiling drywall in the kitchen is soaked; recommend cutting out a 4×8 section and running dehumidifiers for 72 hours.", { subject: "S-201 burst supply line — scope & estimate" }],
      ["ben", "email", wo(5, 1460), "Thanks Mike — approved. Please send the estimate for the drywall and cabinet base so we can get owner sign-off."],
      ["in", "email", wo(5, 2900), "Estimate for the plumbing is $1,020 labor + materials. Drywall and cabinet base repair will come separately from our restoration partner, around $2,480."],
    ] },
    { party: ["vendor", 6], read: true, status: "Waiting", msgs: [
      ["carmen", "email", at(-12, "10:00"), `Hi Tom, our records show your certificate of insurance expires on ${formatMergeDate(coiEnd) || "soon"}. Please send a renewed COI naming Harbor & Pine Residential LLC as additional insured before then so we can keep scheduling work.`, { subject: "Certificate of insurance expiring" }],
      ["in", "email", at(-9, "08:10"), "Hi Carmen — the renewal is in progress with our broker. We should have the new certificate next week."],
    ] },
    { party: ["vendor", 4], channel: "sms", read: true, status: "Closed", msgs: [
      ["ben", "sms", at(-3, "09:00"), "Hi Luis, Ben from Harbor & Pine — can you still make 9–12 tomorrow for the disposal at Pinecrest N-102?"],
      ["in", "sms", at(-3, "09:20"), "Yes — tech will be there 9:30. Sorry about missing Monday.", { source: "webhook" }],
    ] },
    { party: ["prospect", 1], read: false, msgs: [
      ["in", "email", at(-1, "21:40"), "Hi! I saw the sunlit loft one-bedroom at Cascade Lofts on Zillow. Is it still available for December 1, and do you allow a small dog?", { subject: "Is the loft one-bedroom still available?" }],
    ] },
    { party: ["prospect", 5], channel: "sms", read: true, status: "Waiting", msgs: [
      ["tasha", "sms", at(-2, "16:00"), null, { template: W.tpl(6) }],
      ["tasha", "email", at(-2, "16:05"), "Hi Fatima, you're confirmed to tour L-201 at Cascade Lofts on Thursday at 5:30pm. Park on Pine St and buzz the leasing office — I'll meet you in the lobby.", { subject: "Tour confirmation — Cascade Lofts · L-201" }],
    ] },
    { party: ["prospect", 10], read: true, status: "Closed", msgs: [
      ["tasha", "email", at(-20, "10:00"), "Hi Rachel, following up on your tour of B-201 — the studio will be ready mid-November if you're still looking.", { subject: "Following up on your tour" }],
      ["in", "email", at(-19, "18:30"), "Thanks, but I signed a lease closer to work. Best of luck!"],
    ] },
    { party: ["other", { name: "SDCI Permit Desk", email: "permits@sdci.example", phone: "" }], read: true, msgs: [
      ["in", "email", at(-4, "09:05"), "Inspection for permit #6912447-CN (310 Pine St, façade restoration) is scheduled for Oct 27 between 9am and noon. Please make sure inspectors can access the scaffolding.", { subject: "Façade restoration permit — inspection scheduled" }],
      ["note:morgan", "note", at(-4, "10:00"), "Forwarded to Ben — scaffold access confirmed with the GC for the 27th."],
    ] },
  ];
}

async function inbox(W) {
  const { ctx } = W;
  const loaders = { tenant: W.tenant, owner: W.owner, vendor: W.vendor, prospect: W.prospect };
  const templates = new Map(ctx.rows("message_templates").map((t) => [t.id, t]));
  const threads = [];

  // Designed conversations → message drafts.
  for (const conv of conversations(W)) {
    const [type, ref] = conv.party;
    const party = type === "other" ? { type, id: null, ...ref } : partyOf(type, loaders[type](ref));
    if (!party) continue;
    const msgs = [];
    for (const [who, channel, when, text, opts = {}] of conv.msgs) {
      if (!before(when, PAUSE)) continue;
      const inbound = who === "in";
      const note = who.startsWith("note:");
      const staff = inbound ? null : W.member(note ? who.slice(5) : who);
      let subject = opts.subject || "";
      let body = text || "";
      if (opts.template) {
        const t = templates.get(opts.template);
        const values = await W.values({ tenantId: type === "tenant" ? party.id : undefined, leaseId: party.leaseId, unitId: party.unitId, propertyId: party.propertyId }, when, party.name);
        subject = renderMerge(t?.subject || "", values, { keepMissing: false });
        body = renderMerge(t?.body || "", values, { keepMissing: false });
      }
      let status = inbound ? "received" : note ? "logged" : opts.status || "sent";
      let error = opts.error || null;
      if (!inbound && channel === "sms") [status, error] = ["not_sent", SMS_NOT_CONNECTED];
      msgs.push({
        party, channel, subject, body, status, error, at: when, inbound, note,
        actor: staff, templateId: opts.template || null, comm: opts.comm || null,
        metadata: inbound ? (opts.source === "portal" ? { source: "portal", attachments: [] } : opts.source ? { source: opts.source } : { source: "webhook" }) : {},
      });
    }
    if (msgs.length) threads.push({ conv, party, msgs, absorbFrom: conv.absorbFrom == null ? null : at(conv.absorbFrom, "00:00") });
  }

  // Automation sends join the party's designed thread (in its window) or the party's own auto thread.
  const auto = new Map();
  for (const s of W.sends) {
    const key = s.party.id ? `${s.party.type}:${s.party.id}` : null;
    const home = key && threads.find((t) => t.party.id && `${t.party.type}:${t.party.id}` === key && t.absorbFrom && !before(s.at, t.absorbFrom));
    const msg = { ...s, inbound: false, note: false, comm: null };
    if (home) home.msgs.push(msg);
    else {
      const k = key || `other:${W.sends.indexOf(s)}`;
      if (!auto.has(k)) auto.set(k, { conv: { read: true }, party: s.party, msgs: [], automated: true });
      auto.get(k).msgs.push(msg);
    }
  }
  threads.push(...auto.values());

  const comms = ctx.rows("tenant_communications");
  for (const th of threads) {
    th.msgs.sort((a, b) => a.at.localeCompare(b.at));
    const id = W.nid(G.thread);
    const first = th.msgs[0];
    const last = th.msgs[th.msgs.length - 1];
    let unread = 0;
    for (const m of th.msgs) unread = m.inbound ? unread + 1 : 0;
    const p = th.party;
    // Automated threads get closed once a newer conversation with the party starts, or after a quiet week.
    const superseded = th.automated && p.id && threads.some((x) => !x.automated && x.party.id === p.id);
    const stale = before(last.at, at(-7, "00:00"));
    const status = th.conv.status || (th.automated ? (stale || superseded ? "Closed" : "Open") : "Open");
    const tenantRow = p.type === "tenant" ? ctx.byId("tenants", p.id) : null;
    ctx.rows("message_threads").push({
      id,
      subject: th.msgs.find((m) => m.subject)?.subject || "",
      channel: th.conv.channel || (first.channel === "note" ? "email" : first.channel),
      status,
      party_type: p.type === "team" ? "other" : p.type,
      party_id: p.id,
      party_name: p.name || p.email,
      party_email: p.email || null,
      party_phone: p.phone || null,
      lease_id: p.leaseId || tenantRow?.lease_id || null,
      property_id: p.propertyId || null,
      unit_id: p.unitId || null,
      assigned_to: th.msgs.find((m) => m.actor?.id)?.actor.id || null,
      last_message_at: last.at,
      last_message_preview: preview(last.body),
      last_direction: last.inbound ? "inbound" : last.note ? "internal" : "outbound",
      unread_count: th.conv.read === false ? unread : 0,
      message_count: th.msgs.length,
      created_at: first.at,
      ...by(first.actor?.id),
    });

    let threadSubject = "";
    th.msgs.forEach((m) => {
      const direction = m.inbound ? "inbound" : m.note ? "internal" : "outbound";
      // Composer replies are "Re: …"; logged replies and texts carry the thread's subject so far.
      const reply = m.actor?.id && m.channel === "email" && threadSubject;
      const subject = m.note ? "" : m.subject || (reply ? `Re: ${threadSubject.replace(/^re:\s*/i, "")}` : threadSubject);
      threadSubject = threadSubject || m.subject || "";
      W.push("thread_messages", {
        id: W.nid(G.message),
        thread_id: id,
        direction,
        channel: m.channel,
        from_name: m.inbound ? p.name : m.actor?.name || "",
        from_address: m.inbound ? (m.channel === "sms" ? p.phone : p.email) : m.actor?.email || "",
        to_address: m.inbound ? (m.channel === "email" ? `inbox+${id}@reply.harborpine.example` : null) : m.note ? null : m.channel === "sms" ? p.phone : p.email,
        subject,
        body: m.body,
        delivery_status: m.status,
        delivery_error: m.error,
        provider_id: null,
        template_id: m.templateId,
        sent_at: m.at,
        created_at: m.at,
        ...by(!m.inbound && m.actor?.id),
        metadata: m.metadata || {},
      });

      // Tenant communication log mirrors what the server logs (outbound sends, portal / webhook replies).
      if (p.type === "tenant" && !m.note) {
        const row = {
          tenant_id: p.id,
          channel: m.channel,
          direction: m.inbound ? "inbound" : "outbound",
          subject,
          body: m.body,
          occurred_at: m.at,
          created_at: m.at,
          metadata: { threadId: id, ...(m.inbound ? {} : { deliveryStatus: commStatus(m.status), ...(m.error ? { deliveryError: m.error } : {}) }) },
        };
        const existing = m.comm ? comms.find((c) => c.id === W.sb(SB.comm, m.comm)) : null;
        if (existing) Object.assign(existing, row, { subject: subject || existing.subject, metadata: { ...(existing.metadata || {}), ...row.metadata } });
        else comms.push({ id: W.nid(G.comm), ...row, ...by(!m.inbound && m.actor?.id) });
      }

      // Party timeline entry for each send (sendPartyMessage → logActivity "message").
      if (!m.inbound && !m.note && p.id && ["tenant", "owner", "vendor", "prospect"].includes(p.type)) {
        W.log(p.type, p.id, "message", `${m.channel === "sms" ? "SMS" : "Email"} "${m.subject || subject || "Message"}" — ${m.status.replace("_", " ")}`, addSec(m.at, 1), m.actor?.id ? m.actor : { id: null, name: m.actor?.name || "Automation" }, m.actor?.id ? {} : { system: true, ...m.metadata });
      }
    });
  }
}

const commStatus = (s) => ({ sent: "Sent", failed: "Failed", not_sent: "Failed", skipped: "Failed" })[s] || "Sent";

// --- tenant communication log --------------------------------------------------

function communications(W) {
  const rows = W.ctx.rows("tenant_communications");
  const c = (n) => rows.find((r) => r.id === W.sb(SB.comm, n));
  const fix = (n, patch) => c(n) && Object.assign(c(n), patch);
  // Keep the playground log consistent with the story (and never in the future).
  fix(1, { occurred_at: at(-1, "16:50") });
  fix(3, { channel: "call", subject: "Called about the past-due balance", body: "Left a voicemail for Omar about the $1,450 balance and the late fee; asked him to reply to the past-due email or call the office.", occurred_at: at(-6, "11:30") });
  fix(6, { channel: "call", direction: "outbound", subject: "Pre-move-out walkthrough scheduled", body: "Called Lucas to confirm the pre-move-out walkthrough for A-202 and walked him through the deposit return timeline.", occurred_at: at(-2, "15:00"), metadata: {} });
  for (const r of rows) if (!r.created_at && r.occurred_at) r.created_at = r.occurred_at;

  // More history across channels (letters, calls, notes) — [tenant, channel, direction, days, subject, body, deliveryStatus?]
  const MORE = [
    [6, "letter", "outbound", -4, "14-day notice to pay or vacate — B-102", "Posted on the unit door and mailed first-class. Copy saved to the notice record.", "Delivered"],
    [18, "letter", "outbound", -40, "Deposit disposition — TH-4", "Itemized deposit statement mailed to the forwarding address with the $2,575 ACH refund confirmation.", "Delivered"],
    [12, "call", "inbound", -15, "Garage door noisy — TH-2", "Noah called about a squealing garage door. Ben lubricated the tracks during the furnace visit."],
    [10, "email", "outbound", -38, "Welcome to Pinecrest Commons!", "Welcome packet, parking permit and portal invite sent ahead of move-in.", "Opened"],
    [9, "email", "outbound", -12, "Your renewal options for S-101", "Renewal options for S-101 sent: 12 months at $1,625.", "Delivered"],
    [9, "note", "outbound", -8, "Renewal decision pending", "Sofia is comparing a place closer to her office; follow up on the 25th."],
    [17, "email", "outbound", -6, "Conditional approval — N-201", "Approved with an additional half-month deposit; lease to follow once the deposit is received.", "Bounced"],
  ];
  for (const [n, channel, direction, days, subject, body, deliveryStatus] of MORE) {
    const t = W.tenant(n);
    if (!t) continue;
    const when = at(days, "11:15");
    rows.push({ id: W.nid(G.comm), tenant_id: t.id, channel, direction, subject, body, occurred_at: when, created_at: when, metadata: deliveryStatus ? { deliveryStatus } : {} });
  }
}

// --- documents & media ---------------------------------------------------------------

function documents(W) {
  const { ctx } = W;
  const docs = ctx.rows("documents");
  const d = (n) => docs.find((r) => r.id === W.sb(SB.document, n));
  if (d(2)) d(2).created_at = at(-58, "14:00");
  const tdocs = ctx.rows("tenant_documents");
  const td3 = tdocs.find((r) => r.id === W.sb(SB.tenantDocument, 3));
  if (td3) td3.created_at = at(-45, "16:40");

  const id = (g, n) => W.sb(g, n);
  const coiEnd = W.vendor(6)?.insurance_expiry;
  // [ownerType, ownerId, kind, name, sizeKB, days, metadata?, url?]
  const NEW = [
    ["owner", id(SB.owner, 1), "other", "Management agreement — Northwind Holdings (2024).pdf", 962, -410],
    ["owner", id(SB.owner, 1), "other", "W-9 — Northwind Holdings LLC.pdf", 118, -400, { internal: true }],
    ["owner", id(SB.owner, 1), "other", "Q3 2026 owner statement — Northwind Holdings.pdf", 344, -19],
    ["owner", id(SB.owner, 2), "other", "Management agreement — Evergreen Family Trust.pdf", 948, -380],
    ["owner", id(SB.owner, 2), "other", "Certification of trust — Evergreen Family Trust.pdf", 221, -378, { internal: true }],
    ["owner", id(SB.owner, 3), "other", "Management agreement — Alder Court Partners LP.pdf", 955, -520],
    ["owner", id(SB.owner, 3), "insurance", "Owner liability policy — Alder Court Townhomes.pdf", 612, -60],
    ["owner", id(SB.owner, 4), "other", "Management agreement — 14 Birchwood Lane (signed).pdf", 931, -6],
    ["vendor", id(SB.vendor, 1), "insurance", "COI — Rainier Plumbing Co. 2026.pdf", 287, -155],
    ["vendor", id(SB.vendor, 1), "other", "W-9 — Rainier Plumbing Co.pdf", 104, -700, { internal: true }],
    ["vendor", id(SB.vendor, 1), "other", "Master service agreement — Rainier Plumbing.pdf", 486, -690],
    ["vendor", id(SB.vendor, 1), "invoice", "Invoice RP-20931 — S-201 supply line.pdf", 96, -2],
    ["vendor", id(SB.vendor, 3), "insurance", "COI — Evergreen HVAC Services 2026.pdf", 301, -45],
    ["vendor", id(SB.vendor, 3), "inspection", "Quarterly HVAC service report — Pinecrest Commons.pdf", 1180, -33],
    ["vendor", id(SB.vendor, 2), "other", "Electrical contractor license — Brightline Electric.pdf", 156, -210],
    ["vendor", id(SB.vendor, 6), "insurance", `COI — Cascade Landscaping (expires ${formatMergeDate(coiEnd) || "soon"}).pdf`, 275, -347],
    ["lease", id(SB.lease, 10), "lease", "Signed lease — S-102 (Ethan Walker).pdf", 905, -42],
    ["lease", id(SB.lease, 10), "inspection", "Move-in condition checklist — S-102.pdf", 712, -40],
    ["lease", id(SB.lease, 5), "lease", "Pet addendum — A-301 (signed).pdf", 133, -28],
    ["lease", id(SB.lease, 16), "lease_agreement", "B-101 — Zoe Nguyen — agreement.txt", 18, -3],
    ["lease", id(SB.lease, 6), "other", "Repayment plan agreement — B-102 (for signature).pdf", 142, -3, { internal: true }],
    ["tenant", id(SB.tenant, 16), "other", "Move-in welcome packet — B-101.pdf", 1640, -4],
    ["tenant", id(SB.tenant, 15), "insurance", "Renters insurance declarations — Liam O'Connor.pdf", 238, -70],
    ["template", id(SB.leaseTemplate, 2), "other", "WA RLTA disclosure checklist (counsel review).pdf", 318, -120, { internal: true }],
    ["template", id(SB.leaseTemplate, 3), "other", "Oregon ORS 90 addendum — source.docx", 64, -150],
    ["template", id(SB.leaseTemplate, 6), "other", "California AB 1482 notice — draft.docx", 41, -12],
    ["inspection", id(SB.inspection, 4), "inspection", "S-201 water damage — inspection photos.zip", 18400, -6],
    ["move", id(SB.move, 2), "other", "Forwarding address & key return form — TH-3.pdf", 88, -40],
    ["notice", id(SB.notice, 1), "notice", "14-day notice — B-102 (proof of service).pdf", 196, -4],
    ["renewal", id(SB.renewal, 1), "lease", "Renewal offer — A-201.pdf", 174, -5],
    ["deposit", id(SB.deposit, 2), "notice", "Deposit disposition letter — TH-4.pdf", 151, -40],
    ["amenity", id(SB.amenity, 2), "other", "Rooftop deck rules & reservation policy.pdf", 205, -18],
    ["floorplan", id(SB.floorPlan, 3), "other", "The Birch — 2 bed / 2 bath floor plan.pdf", 2380, -400],
    ["unittype", id(SB.unitType, 4), "other", "3 Bed Townhome — finish spec sheet.pdf", 856, -380],
    ["building", id(SB.building, 5), "other", "Loft Building — elevator modernization proposal.pdf", 1320, -26],
    ["pmschedule", id(SB.pmSchedule, 1), "other", "HVAC filter spec — MERV 13 sizes by unit.pdf", 92, -90],
    ["listing", id(SB.listing, 1), "other", "Listing flyer — L-201.pdf", 1450, -3],
    ["property", id(SB.property, 5), "other", "Lobby art selection — option A.jpg", 192, -9, {}, IMG[4]],
    ["property", id(SB.property, 5), "other", "Lobby art selection — option B.jpg", 149, -9, {}, IMG[0]],
    ["portfolio", id(SB.portfolio, 2), "insurance", "Umbrella liability policy — Suburban Homes.pdf", 1022, -75],
    ["library", ctx.projectId, "other", "Vendor onboarding checklist.pdf", 132, -95],
    ["library", ctx.projectId, "other", "Emergency contacts — all properties.pdf", 88, -14],
    ["library", ctx.projectId, "notice", "Notice templates — WA & OR quick reference.pdf", 260, -64],
  ];
  NEW.forEach(([ownerType, ownerId, kind, name, kb, days, metadata = {}, url = ""], i) => {
    if (!ownerId || (ownerType !== "library" && !ctx.rows(tableFor(ownerType)).some((r) => r.id === ownerId))) return;
    docs.push({ id: W.nid(G.document), owner_type: ownerType, owner_id: ownerId, kind, name, url, size_bytes: kb * 1024, created_at: at(days, `${pad(9 + (i % 8))}:${pad((i * 7) % 60)}`), metadata });
  });

  // Tenant paperwork records — [tenant, kind, name, sizeKB, days, metadata?]
  const TD = [
    [16, "insurance", "Renters insurance declarations — Zoe Nguyen.pdf", 241, -2],
    [5, "other", "Pet vaccination record — Miso.pdf", 96, -28],
    [15, "notice", "Returned ACH notice — Oct 2026.pdf", 64, -6, { internal: true }],
    [18, "notice", "Move-out statement — TH-4.pdf", 140, -41],
    [12, "lease", "Renewal agreement — TH-2 (signed).pdf", 880, -125],
  ];
  for (const [n, kind, name, kb, days, metadata = {}] of TD) {
    const t = W.tenant(n);
    if (t) tdocs.push({ id: W.nid(G.tenantDocument), tenant_id: t.id, kind, name, url: "", size_bytes: kb * 1024, created_at: at(days, "15:10"), metadata });
  }
}

const tableFor = (ownerType) =>
  ({
    owner: "owners", vendor: "vendors", lease: "leases", tenant: "tenants", template: "lease_templates", inspection: "inspections",
    move: "moves", notice: "notices", renewal: "renewals", deposit: "security_deposits", amenity: "amenities", floorplan: "floor_plans",
    unittype: "unit_types", building: "buildings", pmschedule: "pm_schedules", listing: "listings", property: "properties", portfolio: "portfolios",
    unit: "units",
  })[ownerType];

function media(W) {
  const rows = W.ctx.rows("media");
  const m = (n) => rows.find((r) => r.id === W.sb(SB.media, n));
  // Publishing / rights metadata on the playground assets.
  const META = {
    1: { altText: "The Marlowe's six-storey facade at dusk", caption: "Hero shot for the website and listings.", tags: ["Exterior", "Hero"], channels: ["Website", "Listings / ILS", "Owner reports"], featured: true, credit: "Lena Ortiz Photography", takenOn: -210, license: "Owned", releaseOnFile: true },
    2: { altText: "Rooftop deck with lounge seating", caption: "Reopened with new furniture and grills.", tags: ["Amenity"], channels: ["Website", "Resident portal", "Social"], credit: "Lena Ortiz Photography", takenOn: -8, license: "Owned" },
    3: { altText: "Bright two-bedroom living room in A-301", tags: ["Interior", "Living"], channels: ["Listings / ILS"], credit: "Tasha Greene", takenOn: -110, license: "Owned" },
    4: { altText: "Galley kitchen in B-101", tags: ["Interior", "Kitchen"], channels: ["Listings / ILS", "Website"], credit: "Tasha Greene", takenOn: -12, license: "Owned" },
    5: { altText: "Pinecrest Commons courtyard", tags: ["Exterior", "Amenity"], channels: ["Website", "Listings / ILS"], credit: "Pacific Frame Studio", takenOn: -260, license: "Licensed", licenseExpires: 140, licenseSource: "Pacific Frame Studio", attributionRequired: true },
    6: { altText: "Tower B entrance", tags: ["Exterior"], channels: ["Website"], credit: "Lena Ortiz Photography", takenOn: -205, license: "Owned" },
    7: { altText: "Alder Court townhome row", tags: ["Exterior", "Neighborhood"], channels: ["Website", "Listings / ILS"], credit: "Jordan Lee", takenOn: -300, license: "Owned" },
    8: { altText: "Front elevation of 14 Birchwood Lane", tags: ["Exterior", "Hero"], channels: ["Owner reports"], credit: "Jordan Lee", takenOn: -150, license: "Owned" },
    9: { altText: "Concept rendering of the renovated Cascade Lofts lobby", caption: "Concept from the design team — not for listings until phase 2 wraps.", tags: ["Lobby", "Interior"], channels: ["Owner reports"], license: "Licensed", licenseSource: "Northlake Design Studio", licenseExpires: 400, usageRestrictions: "Internal and owner reporting only." },
    10: { altText: "360° virtual tour of A-301", caption: "Tour link pending from the photographer.", tags: ["Model unit"], channels: ["Listings / ILS"], publishOn: 21, license: "Owned" },
    11: { altText: "Video walkthrough of Pinecrest Commons", caption: "Walkthrough booked for next week.", tags: ["Neighborhood"], channels: ["Website", "Social"], license: "Owned" },
  };
  const day = (n) => (n == null ? undefined : shiftYmd(TODAY, n));
  for (const [n, meta] of Object.entries(META)) {
    const r = m(Number(n));
    if (!r) continue;
    const { takenOn, licenseExpires, publishOn, ...rest } = meta;
    r.metadata = { ...(r.metadata || {}), ...rest, ...(takenOn != null ? { takenOn: day(takenOn) } : {}), ...(licenseExpires != null ? { licenseExpires: day(licenseExpires) } : {}), ...(publishOn != null ? { publishOn: day(publishOn) } : {}) };
    r.created_at = at(meta.takenOn != null ? meta.takenOn + 2 : -40 + Number(n), "13:20");
  }
  // Assign the unplaced 360 tour and video to their records.
  if (m(10)) Object.assign(m(10), { owner_type: "unit", owner_id: W.sb(SB.unit, 5) });
  if (m(11)) Object.assign(m(11), { owner_type: "property", owner_id: W.sb(SB.property, 2) });

  // New assets — [ownerType, ownerId, kind, name, img | null, cover, sort, status, sizeKB, days, metadata]
  const id = (g, n) => W.sb(g, n);
  const NEW = [
    ["unit", id(SB.unit, 4), "photo", "A-202 — living room", 1, true, 0, "Published", 431, -30, { altText: "Two-bedroom living room with balcony doors", tags: ["Interior", "Living"], channels: ["Listings / ILS"], credit: "Tasha Greene", license: "Owned" }],
    ["unit", id(SB.unit, 20), "photo", "L-201 — exposed brick living area", 4, true, 0, "Published", 468, -5, { altText: "Loft living area with exposed brick and timber beams", tags: ["Interior", "Living", "Hero"], channels: ["Website", "Listings / ILS", "Social"], featured: true, credit: "Lena Ortiz Photography", license: "Owned" }],
    ["unit", id(SB.unit, 20), "photo", "L-201 — view from the bedroom", 0, false, 1, "Published", 402, -5, { altText: "Water view from the loft bedroom window", tags: ["Bedroom"], channels: ["Listings / ILS"], credit: "Lena Ortiz Photography", license: "Owned" }],
    ["unit", id(SB.unit, 18), "photo", "TH-4 — kitchen after make-ready", 3, true, 0, "Draft", 455, -2, { altText: "Refinished townhome kitchen", tags: ["Interior", "Kitchen"], caption: "Waiting on final paint touch-ups before publishing.", credit: "Ben Alvarez", license: "Owned" }],
    ["building", id(SB.building, 1), "photo", "Tower A — street view", 3, true, 0, "Published", 476, -200, { altText: "Tower A from Harbor Ave", tags: ["Exterior"], channels: ["Website"], credit: "Lena Ortiz Photography", license: "Owned" }],
    ["building", id(SB.building, 3), "photo", "North Building — entry path", 2, true, 0, "Published", 388, -240, { altText: "Landscaped path to the North Building", tags: ["Exterior"], channels: ["Website", "Listings / ILS"], credit: "Pacific Frame Studio", license: "Licensed", licenseSource: "Pacific Frame Studio", licenseExpires: shiftYmd(TODAY, 140), attributionRequired: true }],
    ["building", id(SB.building, 5), "photo", "Loft Building — winter view toward the Cascades", 4, true, 0, "Published", 492, -320, { altText: "Snowy mountain view from the Loft Building roof", tags: ["Aerial", "Neighborhood"], channels: ["Website", "Social"], credit: "Northwest Stock Co.", license: "Stock", licenseSource: "Northwest Stock Co.", licenseExpires: shiftYmd(TODAY, 45) }],
    ["amenity", id(SB.amenity, 2), "photo", "Rooftop deck — sunset view", 1, true, 0, "Published", 443, -8, { altText: "Sunset over the hills from the rooftop deck", tags: ["Amenity"], channels: ["Website", "Resident portal"], credit: "Alex Rivera", license: "Owned" }],
    ["amenity", id(SB.amenity, 1), "photo", "Fitness centre", 0, true, 0, "Published", 380, -190, { altText: "Keycard-access fitness centre", tags: ["Amenity", "Interior"], channels: ["Website"], license: "Owned" }],
    ["unittype", id(SB.unitType, 3), "photo", "2 Bed / 2 Bath — model unit", 2, true, 0, "Published", 417, -220, { altText: "Model two-bedroom unit", tags: ["Model unit", "Interior"], channels: ["Website", "Listings / ILS"], license: "Owned" }],
    ["floorplan", id(SB.floorPlan, 1), "floorplan", "The Alcove — floor plan", null, true, 0, "Draft", 0, -15, { altText: "Studio floor plan with sleeping alcove", caption: "Vector plan pending from the architect.", channels: ["Website"], license: "Owned" }],
    ["floorplan", id(SB.floorPlan, 4), "floorplan", "The Cedar — floor plan (two levels)", null, true, 0, "Draft", 0, -15, { altText: "Two-level townhome floor plan", caption: "Vector plan pending from the architect.", license: "Owned" }],
    ["property", id(SB.property, 1), "video", "The Marlowe — rooftop walkthrough", null, false, 3, "Draft", 0, -7, { altText: "Video tour of the rooftop deck", caption: "Edit in progress — 60-second cut for social.", tags: ["Amenity"], channels: ["Social"], license: "Owned" }],
    ["property", id(SB.property, 5), "document", "Cascade Lofts — lobby renovation brochure", null, false, 2, "Archived", 0, -90, { altText: "Phase 1 lobby renovation brochure", caption: "Phase 1 brochure, superseded by the phase 2 concept.", channels: ["Owner reports"], license: "Owned" }],
    ["property", id(SB.property, 2), "photo", "Pinecrest Commons — old leasing office", 0, false, 4, "Archived", 366, -700, { altText: "Former leasing office before the 2025 remodel", tags: ["Interior"], license: "Owned" }],
    ["property", id(SB.property, 3), "photo", "Alder Court — first snow (resident photo)", 4, false, 1, "Published", 501, -330, { altText: "Snow over the hills behind Alder Court", tags: ["Neighborhood"], channels: ["Social", "Resident portal"], credit: "Aisha Bello", license: "Tenant-submitted", releaseOnFile: true }],
    ["property", id(SB.property, 1), "photo", "Neighborhood — waterfront trail", 0, false, 2, "Published", 389, -180, { altText: "Shoreline along the waterfront trail near The Marlowe", tags: ["Neighborhood"], channels: ["Website", "Listings / ILS"], credit: "Northwest Stock Co.", license: "Stock", licenseSource: "Northwest Stock Co.", licenseExpires: shiftYmd(TODAY, 220) }],
    ["property", id(SB.property, 4), "photo", "14 Birchwood Lane — back meadow", 3, false, 1, "Published", 512, -150, { altText: "Meadow behind 14 Birchwood Lane", tags: ["Exterior"], channels: ["Owner reports"], credit: "Jordan Lee", license: "Owned" }],
  ];
  for (const [ownerType, ownerId, kind, name, img, cover, sort, status, kb, days, metadata] of NEW) {
    const url = img == null ? "" : IMG[img];
    rows.push({ id: W.nid(G.media), owner_type: ownerType, owner_id: ownerId, kind, name, url, thumb_url: url, is_cover: cover, sort, size_bytes: kb * 1024, status, created_at: at(days, "12:40"), metadata });
  }
}

// --- scheduled reports ----------------------------------------------------------------

// [n, name, report, frequency, day (weekday | month day), filters, recipient keys / emails, created (days)]
function scheduleSpecs(W) {
  const team = (...k) => k.map((x) => emailOf(TEAM[x][1]));
  const owner = (n) => W.owner(n)?.email;
  return [
    [1, "Monthly owner statement — Northwind Holdings", "owner_statements", "monthly", 3, { preset: "last_month", ownerId: W.sb(SB.owner, 1), propertyId: "all" }, [owner(1), ...team("alex")], -150],
    [2, "Monthly owner statement — Evergreen Family Trust", "owner_statements", "monthly", 3, { preset: "last_month", ownerId: W.sb(SB.owner, 2), propertyId: "all" }, [owner(2), ...team("jordan")], -150],
    [3, "Weekly delinquency", "delinquency", "weekly", 1, { preset: "today", propertyId: "all" }, team("carmen", "alex", "jordan"), -120],
    [4, "Rent roll — month start", "rent_roll", "monthly", 1, { preset: "this_month", propertyId: "all", status: "all" }, team("morgan", "carmen"), -140],
    [5, "Daily occupancy snapshot", "occupancy", "daily", null, { preset: "this_month", propertyId: "all" }, team("dana", "tasha"), -30],
    [6, "Monthly P&L — all properties", "financial_statements", "monthly", 5, { preset: "last_month", propertyId: "all", view: "pnl" }, team("morgan", "carmen"), -100],
    [7, "Month-end trial balance", "trial_balance", "monthly", 2, { preset: "last_month", propertyId: "all" }, team("carmen"), -90],
    [8, "Maintenance report — Pinecrest Commons", "maintenance_report", "weekly", 5, { preset: "this_month", propertyId: W.sb(SB.property, 2) }, [...team("jordan", "ben"), owner(2)], -75],
    [9, "Leasing funnel — this quarter", "leasing_report", "weekly", 1, { preset: "this_quarter", propertyId: "all" }, team("tasha", "dana"), -60],
    [10, "A/P aging", "ap_aging", "weekly", 4, { preset: "today", propertyId: "all" }, team("carmen"), -55],
    [11, "Vendor insurance compliance", "insurance_compliance", "weekly", 1, { preset: "today", propertyId: "all", party: "vendor", state: "all" }, team("carmen", "ben"), -40],
    [12, "Management fees — monthly", "management_fees", "monthly", 4, { preset: "last_month", propertyId: "all" }, team("carmen", "morgan"), -70],
  ];
}

// Past send dates for a schedule (UTC), newest first, before the pause and after it was created.
function sendDates(freq, dayN, createdIso, count) {
  const out = [];
  for (let d = 0; d <= 120 && out.length < count; d += 1) {
    const day = shiftYmd(TODAY, -d);
    const t = utc(day, "12:00", 6);
    if (!before(t, PAUSE) || before(t, createdIso)) continue;
    const date = new Date(`${day}T00:00:00Z`);
    if (freq === "daily" || (freq === "weekly" && date.getUTCDay() === dayN) || (freq === "monthly" && date.getUTCDate() === dayN)) out.push(t);
  }
  return out;
}

async function reports(W) {
  const { ctx } = W;
  const cache = new Map();
  const RUN_COUNT = { daily: 3, weekly: 3, monthly: 2 };
  // A few non-happy outcomes: [schedule n, index (0 = newest)] → status.
  const OUTCOME = { "1:1": "partial", "3:2": "not_configured", "9:1": "failed" };
  for (const [n, name, reportKey, frequency, dayN, filters, recipients, created] of scheduleSpecs(W)) {
    const def = getReport(reportKey);
    if (!def) continue;
    const createdAt = at(created, "16:30");
    const s = {
      id: W.sb(G.schedule, n),
      name,
      report_key: reportKey,
      filters,
      recipients: recipients.filter(Boolean),
      frequency,
      day_of_week: frequency === "weekly" ? dayN : null,
      day_of_month: frequency === "monthly" ? dayN : null,
      // Paused: the scheduled_reports job only picks up Active schedules.
      status: "Paused",
      last_run_at: null,
      last_status: null,
      created_at: createdAt,
      updated_at: PAUSE,
      metadata: {},
    };
    const dates = sendDates(frequency, dayN, createdAt, RUN_COUNT[frequency]);
    for (const [i, t] of dates.entries()) {
      const now = new Date(t);
      let summary = [];
      let csv = "";
      let html = "";
      let rowCount = 0;
      try {
        const data = await loadServerSources(W.db, ctx.projectId, def.sources, cache);
        const resolved = resolveFilters(def, filters, data, now);
        const result = runReport(def, data, resolved, now);
        const sections = result.empty ? [] : result.sections.filter((x) => x.columns?.length);
        rowCount = sections.reduce((k, x) => k + (x.rows?.length || 0), 0);
        summary = result.empty ? [{ label: result.empty.title, value: "", footer: result.empty.description }] : result.stats;
        csv = sectionsCsv(sections);
        html = reportHtml({
          title: result.title,
          subtitle: [result.subtitle, result.periodLabel].filter(Boolean).join(" · "),
          generatedAt: `${t.slice(0, 16).replace("T", " ")} UTC`,
          stats: result.stats,
          sections,
        });
      } catch (e) {
        summary = [{ label: def.title, value: "", footer: "Report data unavailable" }];
        console.warn(`workspace: report ${reportKey} preview failed — ${e?.message || e}`);
      }
      const status = OUTCOME[`${n}:${i}`] || "sent";
      const list = s.recipients;
      const sent = status === "sent" ? list.length : status === "partial" ? list.length - 1 : 0;
      const error =
        status === "partial" ? `${list[0]}: 422 Recipient suppressed after a hard bounce`
          : status === "not_configured" ? "Email delivery is not configured"
            : status === "failed" ? list.map((r) => `${r}: 503 Email service unavailable`).join("; ")
              : null;
      // Older runs keep only the summary + CSV; the newest keeps the rendered HTML too.
      W.push("report_runs", {
        id: W.hid(G.reportRun, `${s.id}|${periodKeyFor(s, now)}`),
        schedule_id: s.id,
        report_key: reportKey,
        period_key: periodKeyFor(s, now),
        status,
        recipients: list,
        sent_count: sent,
        row_count: rowCount,
        summary,
        csv,
        html: i === 0 ? html : "",
        error,
        created_at: addSec(t, 20 + n),
      });
      if (i === 0) [s.last_run_at, s.last_status] = [addSec(t, 20 + n), status];
    }
    ctx.rows("report_schedules").push(s);
  }
}

// --- scheduled-job history --------------------------------------------------------------

function jobRuns(W) {
  // One "Run due now" pass from the Scheduled Jobs dialog, plus individual Run now clicks.
  // [job key, days, hh:mm, status, processed, created, skipped, errors[]]
  const batch = at(-9, "10:12");
  const RUNS = [
    ["automations", -30, "09:02", "succeeded", 6, 4, 2, []],
    ["automations", -14, "15:31", "succeeded", 3, 3, 0, []],
    ["scheduled-announcements", -25, "12:04", "succeeded", 1, 17, 0, []],
    ["scheduled-announcements", -12, "12:02", "succeeded", 1, 1, 0, []],
    ["lease-reminders", -2, "13:06", "succeeded", 16, 0, 22, []],
    ["rent-reminders", -22, "14:03", "succeeded", 15, 15, 0, []],
    ["rent-reminders", -16, "14:01", "succeeded", 15, 0, 15, []],
    ["expiring-documents", -6, "15:04", "succeeded", 9, 2, 7, []],
    ["preventive-work-orders", -3, "06:12", "succeeded", 10, 0, 10, []],
    ["recurring-charges", -19, "05:18", "succeeded", 10, 10, 0, []],
    ["late-fees", -13, "06:33", "succeeded", 3, 3, 0, []],
    ["management-fees", -18, "07:05", "partial", 4, 3, 0, ["Jonathan Reyes: no ownership split on file for 14 Birchwood Lane"]],
    ["deposit-interest", -19, "07:31", "succeeded", 1, 1, 0, []],
    ["autopay", -19, "08:02", "succeeded", 4, 4, 0, []],
    ["scheduled_reports", -16, "12:03", "failed", 0, 0, 0, ["report_schedules: canceling statement due to statement timeout"]],
    ["scheduled_reports", -15, "12:05", "succeeded", 2, 2, 0, []],
  ];
  const BATCH = [
    ["recurring-charges", "succeeded", 10, 0, 10, []],
    ["late-fees", "succeeded", 3, 0, 3, []],
    ["management-fees", "succeeded", 4, 0, 4, []],
    ["deposit-interest", "succeeded", 1, 0, 1, []],
    ["autopay", "succeeded", 4, 0, 4, []],
    ["preventive-work-orders", "succeeded", 10, 2, 8, []],
    ["scheduled-announcements", "succeeded", 0, 0, 0, []],
    ["lease-reminders", "succeeded", 16, 5, 11, []],
    ["rent-reminders", "succeeded", 15, 0, 15, []],
    ["expiring-documents", "partial", 11, 3, 7, ["document_expiring → crew@cascadelandscaping.example: 422 Template property.document_expiring is not published"]],
    ["automations", "succeeded", 2, 1, 1, []],
    ["scheduled_reports", "succeeded", 0, 0, 12, []],
  ];
  const push = (key, start, status, processed, created, skipped, errors, secs) =>
    W.push("job_runs", {
      id: W.nid(G.jobRun), job_key: key, trigger_source: "manual", status, started_at: start, finished_at: addSec(start, secs),
      processed, created, skipped, error_count: errors.length, errors, created_at: start,
    });
  for (const [key, days, hhmm, ...rest] of RUNS) push(key, at(days, hhmm), ...rest, 2 + (rest[1] % 9));
  // The runner pass that hit the façade work order's event timeout, and the manual pass after the pause.
  if (W.failedPass) push("automations", addSec(W.failedPass, -2), "partial", 2, 0, 1, ["Event work_order.created: work_orders: canceling statement due to statement timeout"], 31);
  if (W.ignoredPass) push("automations", addSec(W.ignoredPass, -1), "succeeded", 1, 0, 0, [], 2);
  let t = batch;
  for (const [key, ...rest] of BATCH) {
    push(key, t, ...rest, 1 + (rest[1] % 5));
    t = addSec(t, 2 + (rest[1] % 5));
  }
}

// --- notification sends ---------------------------------------------------------------

// History of reminder emails plus pre-claimed dedupe keys: every key the reminder jobs can
// derive from the seeded leases / documents is already "sent", so the jobs stay idle.
function notificationSends(W) {
  const { ctx } = W;
  const seen = new Set();
  const add = (row) => {
    if (seen.has(row.dedupe_key)) return;
    seen.add(row.dedupe_key);
    const reserved = row.reserved;
    delete row.reserved;
    W.push("notification_sends", {
      id: W.hid(G.send, row.dedupe_key),
      channel: "email",
      status: "sent",
      error: null,
      recipient: null,
      record_type: null,
      record_id: null,
      created_by: null,
      ...row,
      created_at: row.created_at || ago(5),
      metadata: reserved ? { reserved: true, note: "Pre-claimed by the demo seed so the reminder job stays idle (everything paused)." } : {},
    });
  };
  // A milestone sent on day `d` at the job's hour, or reserved when it hasn't come yet.
  const when = (d, hhmm) => (d && d <= TODAY && before(utc(d, hhmm), PAUSE) ? { created_at: utc(d, hhmm, 30) } : { reserved: true });

  const fees = W.setting("fees_policies");
  const props = new Map(ctx.rows("properties").map((p) => [p.id, p]));
  const units = new Map(ctx.rows("units").map((u) => [u.id, u]));
  const parties = ctx.rows("lease_parties").filter((p) => !p.deleted_at && p.role === "tenant" && p.email);

  for (const lease of ctx.rows("leases")) {
    if (lease.deleted_at || !["Active", "Expiring soon", "Pending"].includes(lease.status) || !lease.term_end || lease.term_end < TODAY) continue;
    const property = props.get(lease.property_id) || props.get(units.get(lease.unit_id)?.property_id);
    const policies = effectivePolicies({ company: fees, property, lease });
    const window = Number(policies.renewalNoticeDays) || 90;
    const opened = shiftYmd(lease.term_end, -window);
    const key = `renewal-window:${lease.id}:${lease.term_end}`;
    const w = when(opened, "13:00");
    add({ dedupe_key: key, job_key: "lease-reminders", notification: "staff_alerts", record_type: "lease", record_id: lease.id, ...w });
    if (!w.reserved) {
      W.log("lease", lease.id, "reminder", `Renewal window open — lease ends ${formatMergeDate(lease.term_end)} (${daysBetween(opened, lease.term_end)} days)`, w.created_at, { id: null, name: "Scheduler" }, { system: true });
      for (const email of ALERT_EMAILS) add({ dedupe_key: `${key}:${email}`, job_key: "lease-reminders", notification: "staff_alerts", recipient: email, ...w });
    }
    const tenant = ctx.byId("tenants", lease.tenant_id);
    const emails = new Set([tenant?.email, ...parties.filter((p) => p.lease_id === lease.id).map((p) => p.email)].filter(Boolean).map((e) => e.toLowerCase()));
    if (!emails.size) emails.add("none");
    for (const bucket of NOTIFICATIONS.leaseReminderDays) {
      for (const email of emails) {
        add({
          dedupe_key: `lease-expiring:${lease.id}:${lease.term_end}:${bucket}:${email}`, job_key: "lease-reminders", notification: "lease_expiring",
          recipient: email === "none" ? null : email, status: email === "none" ? "no_address" : "sent", record_type: "lease", record_id: lease.id,
          ...when(shiftYmd(lease.term_end, -bucket), "13:00"),
        });
      }
    }
  }

  // Rent reminders already sent for the last two due dates (rentReminderDays before each lease's due day).
  for (const k of [-1, 0]) {
    for (const lease of ctx.rows("leases")) {
      if (lease.deleted_at || lease.status !== "Active" || !(Number(lease.rent) > 0)) continue;
      const property = props.get(lease.property_id) || props.get(units.get(lease.unit_id)?.property_id);
      const dueDay = Math.min(28, Math.max(1, Number(effectivePolicies({ company: fees, property, lease }).rentDueDay) || 1));
      const due = `${monthKey(k)}-${pad(dueDay)}`;
      const sentOn = shiftYmd(due, -NOTIFICATIONS.rentReminderDays);
      if (!before(utc(sentOn, "14:00", 40), PAUSE) || !lease.term_start || lease.term_start > sentOn) continue;
      const email = ctx.byId("tenants", lease.tenant_id)?.email?.toLowerCase();
      if (!email) continue;
      const failed = k === 0 && lease.id === W.sb(SB.lease, 15);
      add({
        dedupe_key: `rent-reminder:${lease.id}:${due}:${email}`, job_key: "rent-reminders", notification: "rent_reminder", recipient: email,
        record_type: "lease", record_id: lease.id, created_at: utc(sentOn, "14:00", 40), status: failed ? "failed" : "sent", error: failed ? "550 5.2.2 Mailbox full" : null,
      });
    }
  }

  // Expiring documents: COIs / licenses / renters insurance / pets / vehicles / compliance items, owner agreements, W-9s.
  const items = ctx.rows("record_items").filter((r) => !r.deleted_at && String(r.status || "").toLowerCase() !== "cancelled");
  const MARKS = { "vendor:insurance_policy": [30, 14, 0], "vendor:license": [30, 0], "tenant:insurance_policy": [30, 7, 0], "tenant:pet": [30, 0], "tenant:vehicle": [30, 0] };
  for (const it of items) {
    if (!it.ends_on) continue;
    const marks = MARKS[`${it.owner_type}:${it.kind}`];
    if (marks) {
      const party = ctx.byId(it.owner_type === "vendor" ? "vendors" : "tenants", it.owner_id);
      for (const mark of marks) {
        add({
          dedupe_key: `doc-expiring:${it.kind}:${it.id}:${it.ends_on}:${mark}`, job_key: "expiring-documents", notification: "document_expiring",
          recipient: party?.email || null, status: party?.email ? "sent" : "no_address", record_type: it.owner_type, record_id: it.owner_id,
          ...when(shiftYmd(it.ends_on, -mark), "15:00"),
        });
      }
    }
    if (it.kind === "compliance_item") {
      for (const mark of [30, 0]) {
        add({ dedupe_key: `doc-staff:compliance:${it.id}:${it.ends_on}:${mark}`, job_key: "expiring-documents", notification: "staff_alerts", record_type: it.owner_type, record_id: it.owner_id, ...when(shiftYmd(it.ends_on, -mark), "15:00") });
      }
    }
  }
  const year = TODAY.slice(0, 4);
  for (const v of ctx.rows("vendors")) {
    if (v.deleted_at || ["inactive", "do not use"].includes(String(v.status || "").toLowerCase())) continue;
    if (v.insurance_expiry) {
      for (const mark of [30, 14, 0]) {
        add({ dedupe_key: `doc-expiring:vendor-coi:${v.id}:${v.insurance_expiry}:${mark}`, job_key: "expiring-documents", notification: "document_expiring", recipient: v.email || null, record_type: "vendor", record_id: v.id, ...when(shiftYmd(v.insurance_expiry, -mark), "15:00") });
      }
    }
    if (!v.metadata?.w9OnFile) add({ dedupe_key: `doc-expiring:w9:vendor:${v.id}:${year}:none:dec`, job_key: "expiring-documents", notification: "document_expiring", recipient: v.email || null, record_type: "vendor", record_id: v.id, reserved: true });
  }
  for (const o of ctx.rows("owners")) {
    if (o.deleted_at || o.status === "Inactive") continue;
    const m = o.metadata || {};
    if (m.agreementEnd) {
      for (const mark of [60, 30, 0]) {
        add({ dedupe_key: `doc-expiring:owner-agreement:${o.id}:${m.agreementEnd}:${mark}`, job_key: "expiring-documents", notification: "document_expiring", recipient: o.email || null, record_type: "owner", record_id: o.id, ...when(shiftYmd(m.agreementEnd, -mark), "15:00") });
      }
    }
    if (!m.w9OnFile && m.requires1099 !== false) add({ dedupe_key: `doc-expiring:w9:owner:${o.id}:${year}:none:dec`, job_key: "expiring-documents", notification: "document_expiring", recipient: o.email || null, record_type: "owner", record_id: o.id, reserved: true });
  }
  // This month's missing-renters-insurance reminder (first run of the month).
  const insured = new Set(items.filter((i) => i.owner_type === "tenant" && i.kind === "insurance_policy").map((i) => i.owner_id));
  const firstRun = utc(`${TODAY.slice(0, 7)}-01`, "15:00", 50);
  for (const t of ctx.rows("tenants")) {
    if (t.deleted_at || !["Current", "Late", "Notice"].includes(t.status) || insured.has(t.id) || t.metadata?.insuranceWaived) continue;
    add({ dedupe_key: `doc-expiring:renters-missing:${t.id}:${TODAY.slice(0, 7)}:none:missing`, job_key: "expiring-documents", notification: "document_expiring", recipient: t.email || null, record_type: "tenant", record_id: t.id, ...(before(firstRun, PAUSE) ? { created_at: firstRun } : { reserved: true }) });
  }

  // Further-out keys from the people area's helper (24 months of rent reminders and
  // missing-insurance months, next year's W-9s); keys already written above win.
  for (const r of ctx.peoplePausedSends?.() || []) {
    add({ dedupe_key: r.dedupe_key, job_key: r.job_key, notification: r.notification, record_type: r.record_type, record_id: r.record_id, reserved: true });
  }
}

// --- activity timelines ---------------------------------------------------------------

function activity(W) {
  const { ctx } = W;
  const rows = ctx.rows("activity");
  const a = (n) => rows.find((r) => r.id === W.sb(SB.activity, n));
  // Playground rows that contradicted the story (Lucas is moving out).
  if (a(7)) Object.assign(a(7), { occurred_at: at(-58, "14:00"), metadata: { system: true, changes: { status: ["Occupied", "Notice"] } } });
  if (a(8)) Object.assign(a(8), { summary: "Pre-move-out walkthrough done — minor wall scuffs; listing photos booked for after move-out.", occurred_at: at(-2, "15:30") });
  for (const r of rows) if (!r.created_at) r.created_at = r.occurred_at;

  const m = W.member;
  const sys = { system: true };
  const ch = (field, from, to) => ({ system: true, changes: { [field]: [from, to] } });
  // [ownerType, owner, verb, summary, days, hh:mm, actor key | "portal:<name>", metadata?]
  const id = (g, n) => W.sb(g, n);
  const ENTRIES = [
    // Properties
    ["property", id(SB.property, 1), "created", "Created property", -720, "09:00", "morgan", sys],
    ["property", id(SB.property, 1), "action", "Assigned owner Northwind Holdings LLC (100%)", -719, "09:20", "morgan", sys],
    ["property", id(SB.property, 1), "updated", "Updated insurance", -88, "10:05", "carmen", ch("insuranceRenewal", "2025-10-01", "2026-10-01")],
    ["property", id(SB.property, 2), "created", "Created property", -540, "11:00", "jordan", sys],
    ["property", id(SB.property, 2), "note", "Pool and courtyard furniture closed for the season.", -16, "16:00", "jordan"],
    ["property", id(SB.property, 2), "updated", "Updated amenities", -60, "13:30", "jordan", ch("amenities", "Covered parking", "Covered parking, Package lockers")],
    ["property", id(SB.property, 3), "note", "Gutters cleared before winter — no issues on the drive-by inspection.", -12, "11:40", "jordan"],
    ["property", id(SB.property, 4), "action", "Assigned owner Jonathan Reyes (100%) — onboarding", -12, "09:30", "dana", sys],
    ["property", id(SB.property, 4), "note", "Owner signed the management agreement; W-9 still pending.", -5, "09:20", "dana"],
    ["property", id(SB.property, 5), "attached", "Attached Lobby art selection — option A.jpg", -9, "10:10", "alex", sys],
    ["property", id(SB.property, 5), "note", "SDCI façade inspection booked for Oct 27 — scaffold access confirmed.", -4, "10:05", "morgan"],
    // Units
    ["unit", id(SB.unit, 14), "updated", "Status changed from Occupied to Down", -20, "08:15", "ben", ch("status", "Vacant", "Down")],
    ["unit", id(SB.unit, 14), "note", "Subfloor drying — dehumidifiers running through Thursday.", -3, "17:20", "ben"],
    ["unit", id(SB.unit, 20), "attached", "Added L-201 — exposed brick living area to the gallery", -5, "12:45", "tasha", sys],
    ["unit", id(SB.unit, 20), "updated", "Updated rent", -6, "09:10", "tasha", ch("rent", 2150, 2100)],
    ["unit", id(SB.unit, 6), "updated", "Status changed from Make-ready to Vacant", -12, "16:00", "ben", ch("status", "Make-ready", "Vacant")],
    ["unit", id(SB.unit, 17), "updated", "Status changed from Occupied to Notice", -45, "16:45", "jordan", ch("status", "Occupied", "Notice")],
    ["unit", id(SB.unit, 22), "note", "Make-ready: new flooring in the bedroom, paint scheduled next week.", -7, "14:10", "ben"],
    // Tenants
    ["tenant", id(SB.tenant, 6), "updated", "Status changed from Current to Late", -13, "00:05", "carmen", ch("status", "Current", "Late")],
    ["tenant", id(SB.tenant, 6), "note", "Repayment plan agreed — $500 then two $475 installments.", -4, "10:15", "carmen"],
    ["tenant", id(SB.tenant, 8), "note", "Promised $1,000 by Friday; remainder with November rent.", -1, "17:00", "alex"],
    ["tenant", id(SB.tenant, 15), "note", "Oct 3 ACH returned (R01). Returned-payment fee waived once.", -6, "10:25", "carmen"],
    ["tenant", id(SB.tenant, 16), "created", "Created tenant", -18, "15:00", "tasha", sys],
    ["tenant", id(SB.tenant, 16), "action", "Invited to the resident portal", -4, "13:05", "tasha", sys],
    ["tenant", id(SB.tenant, 5), "portal", "Uploaded renters insurance (Lemonade) for review", -27, "19:40", "portal:Hannah Brooks", sys],
    ["tenant", id(SB.tenant, 2), "portal", "Submitted a maintenance request: Dishwasher not draining", -1, "13:28", "portal:Daniel Okafor", sys],
    ["tenant", id(SB.tenant, 7), "portal", "Submitted a maintenance request: Bathroom exhaust fan rattling", -2, "08:28", "portal:Grace Kim", sys],
    ["tenant", id(SB.tenant, 10), "portal", "Submitted a maintenance request: Ants in kitchen", -5, "03:28", "portal:Ethan Walker", sys],
    ["tenant", id(SB.tenant, 13), "updated", "Updated forwarding address", -40, "18:10", "jordan", ch("forwardingAddress", "", "2214 W Riverside Ave, Spokane, WA 99201")],
    ["tenant", id(SB.tenant, 18), "updated", "Status changed from Current to Past", -55, "12:00", "jordan", ch("status", "Current", "Past")],
    // Leases
    ["lease", id(SB.lease, 16), "created", "Created lease", -17, "11:00", "tasha", sys],
    ["lease", id(SB.lease, 16), "action", "Sent the lease for e-signature", -2, "10:20", "tasha", sys],
    ["lease", id(SB.lease, 16), "action", "Scheduled the move-in and move-in inspection", -5, "15:35", "tasha", sys],
    ["lease", id(SB.lease, 4), "action", "Renewal declined — tenant moving out", -58, "14:05", "tasha", sys],
    ["lease", id(SB.lease, 13), "action", "Renewal declined — tenant moving out", -45, "16:50", "jordan", sys],
    ["lease", id(SB.lease, 3), "action", "Sent renewal offer: $1,995 for 12 months", -5, "11:05", "tasha", sys],
    ["lease", id(SB.lease, 6), "note", "Repayment plan addendum drafted; late fees paused while current.", -4, "10:30", "carmen"],
    ["lease", id(SB.lease, 12), "action", "Renewal accepted — new lease “TH-2 — Noah Schmidt”", -128, "09:40", "jordan", sys],
    ["lease", id(SB.lease, 18), "updated", "Status changed from Expiring soon to Ended", -55, "12:05", "jordan", ch("status", "Expiring soon", "Ended")],
    // Work orders
    ["workorder", id(SB.workOrder, 5), "created", "Created work order", -4, "00:35", "ben", sys],
    ["workorder", id(SB.workOrder, 5), "action", "Assigned Rainier Plumbing Co.", -4, "00:50", "ben", sys],
    ["workorder", id(SB.workOrder, 5), "portal", "Submitted invoice RP-20931 for 1020.00", -2, "16:40", "portal:Rainier Plumbing Co.", sys],
    ["workorder", id(SB.workOrder, 2), "portal", "Submitted a maintenance request: Dishwasher not draining", -1, "13:28", "portal:Daniel Okafor", sys],
    ["workorder", id(SB.workOrder, 3), "portal", "Submitted a maintenance request: Bathroom exhaust fan rattling", -2, "08:28", "portal:Grace Kim", sys],
    ["workorder", id(SB.workOrder, 4), "note", "Vendor missed Monday — rebooked for 9:30 Wednesday.", -3, "09:25", "ben"],
    ["workorder", id(SB.workOrder, 7), "updated", "Status changed from Open to On hold", -5, "11:00", "ben", ch("status", "Open", "On hold")],
    ["workorder", id(SB.workOrder, 9), "updated", "Status changed from In progress to Completed", -12, "15:20", "ben", ch("status", "In progress", "Completed")],
    ["workorder", id(SB.workOrder, 10), "portal", "Approved work order: Refrigerator not cooling", -24, "18:05", "portal:Jonathan Reyes", sys],
    // Owners & vendors
    ["owner", id(SB.owner, 1), "note", "Asked for the Q4 distribution by the 10th (capital call on the 12th).", -1, "16:30", "alex"],
    ["owner", id(SB.owner, 4), "attached", "Attached Management agreement — 14 Birchwood Lane (signed).pdf", -6, "09:00", "dana", sys],
    ["owner", id(SB.owner, 4), "portal", "Updated contact preferences in the portal", -6, "20:50", "portal:Jonathan Reyes", sys],
    ["owner", id(SB.owner, 2), "portal", "Approved work order: Replace HVAC filters — Tower A", -40, "12:00", "portal:Evergreen Family Trust", sys],
    ["vendor", id(SB.vendor, 6), "note", "COI renewal in progress with their broker — follow up next week.", -9, "08:20", "carmen"],
    ["vendor", id(SB.vendor, 1), "updated", "Updated rating", -10, "14:00", "ben", ch("rating", 4.7, 4.8)],
    ["vendor", id(SB.vendor, 4), "note", "Missed the first N-102 appointment; apologised and rebooked.", -3, "09:22", "ben"],
    ["vendor", id(SB.vendor, 1), "portal", "Uploaded an insurance certificate for review", -155, "10:00", "portal:Rainier Plumbing Co.", sys],
    // Buildings, portfolios, automations
    ["building", id(SB.building, 1), "note", "Elevator door operator on order — Vertical Lift ETA 48 hours.", -1, "08:00", "ben"],
    ["portfolio", id(SB.portfolio, 1), "note", "Q4 capex plan approved: Cascade lobby phase 2 + Marlowe elevator.", -21, "15:00", "dana"],
    ["automation", id(SB.automation, 1), "updated", "Status changed from Active to Paused", 0, null, "morgan", ch("status", "Active", "Paused")],
    ["automation", id(SB.automation, 7), "note", "Switching email providers — keep paused until the new domain is verified.", -33, "10:00", "alex"],
  ];
  for (const [ownerType, ownerId, verb, summary, days, hhmm, who, metadata = {}] of ENTRIES) {
    if (!ownerId || (tableFor(ownerType) && !ctx.rows(tableFor(ownerType)).some((r) => r.id === ownerId) && !["automation", "workorder"].includes(ownerType))) continue;
    const when = hhmm ? at(days, hhmm) : addMin(PAUSE, 1);
    if (!before(when, ago(1))) continue;
    const actor = who.startsWith("portal:") ? { id: null, name: who.slice(7) } : m(who);
    W.log(ownerType, ownerId, verb, summary, when, actor, metadata);
  }
}

// --- entry ---------------------------------------------------------------------------

export async function apply(ctx) {
  const W = makeEnv(ctx);
  settings(W);
  templates(W);
  announcements(W);
  await automations(W);
  await inbox(W);
  communications(W);
  documents(W);
  media(W);
  await reports(W);
  jobRuns(W);
  notificationSends(W);
  activity(W);
}
