// Automation workflow catalog (isomorphic, plain data): triggers, the record
// types they fire on, condition fields/operators, step (action) types and the
// built-in starter workflows. Definitions live on property.automations:
// trigger_event = trigger key, metadata.trigger = trigger config,
// metadata.conditionRules = [{ field, op, value }], metadata.steps = [{ id, type, config }].

export const RECORD_TYPES = {
  lease: { table: "leases", ownerType: "lease", label: "Lease", titleCols: ["name", "tenant_name"] },
  application: { table: "applications", ownerType: "application", label: "Application", titleCols: ["applicant_name", "name"] },
  work_order: { table: "work_orders", ownerType: "workorder", label: "Work order", titleCols: ["name"] },
  transaction: { table: "transactions", ownerType: "transaction", label: "Payment", titleCols: ["name", "payee"] },
  online_payment: { table: "online_payments", ownerType: "online_payment", label: "Online payment", titleCols: ["description", "payer_name"] },
  tenant: { table: "tenants", ownerType: "tenant", label: "Tenant", titleCols: ["name"] },
  move: { table: "moves", ownerType: "move", label: "Move", titleCols: ["name", "tenant_name"] },
};

export const TABLE_RECORD_TYPE = Object.fromEntries(
  Object.entries(RECORD_TYPES).map(([k, v]) => [v.table, k]),
);

export const recordTitle = (type, row) => {
  const cols = RECORD_TYPES[type]?.titleCols || ["name"];
  for (const c of cols) if (row?.[c]) return String(row[c]);
  return RECORD_TYPES[type]?.label || "Record";
};

export const TRIGGER_GROUPS = ["Leases", "Applications", "Maintenance", "Rent & payments", "Moves", "Schedule"];

export const TRIGGERS = [
  { key: "lease.created", label: "Lease created", group: "Leases", record: "lease", desc: "A new lease record is added." },
  { key: "lease.activated", label: "Lease activated", group: "Leases", record: "lease", desc: "A lease's status becomes Active." },
  {
    key: "lease.ending",
    label: "Lease ending",
    group: "Leases",
    record: "lease",
    timed: true,
    desc: "Once per lease when its end date comes within the window.",
    config: [{ key: "daysBefore", label: "Days before the end date", type: "number", default: 60, min: 1 }],
  },
  { key: "application.submitted", label: "Application submitted", group: "Applications", record: "application", desc: "A rental application is received." },
  { key: "application.approved", label: "Application approved", group: "Applications", record: "application", desc: "An application's status becomes Approved." },
  { key: "work_order.created", label: "Work order created", group: "Maintenance", record: "work_order", desc: "A new work order is opened." },
  { key: "work_order.completed", label: "Work order completed", group: "Maintenance", record: "work_order", desc: "A work order's status becomes Completed." },
  { key: "payment.received", label: "Payment received", group: "Rent & payments", record: "transaction", desc: "An income transaction is recorded against a tenant or lease." },
  {
    key: "rent.overdue",
    label: "Rent overdue",
    group: "Rent & payments",
    record: "tenant",
    timed: true,
    desc: "Once a month per tenant whose balance is still open after the due date.",
    config: [
      { key: "daysOverdue", label: "Days after the due date", type: "number", default: 5, min: 1 },
      { key: "minBalance", label: "Minimum balance ($)", type: "number", default: 1, min: 0 },
    ],
  },
  { key: "move_in.scheduled", label: "Move-in scheduled", group: "Moves", record: "move", desc: "A move-in gets a date." },
  { key: "move_out.scheduled", label: "Move-out scheduled", group: "Moves", record: "move", desc: "A move-out gets a date." },
  {
    key: "schedule",
    label: "On a schedule",
    group: "Schedule",
    record: null,
    timed: true,
    desc: "Runs daily, weekly or monthly — once, or for each matching record.",
    config: [
      {
        key: "frequency",
        label: "Frequency",
        type: "select",
        default: "weekly",
        options: [
          { value: "daily", label: "Daily" },
          { value: "weekly", label: "Weekly" },
          { value: "monthly", label: "Monthly" },
        ],
      },
      {
        key: "weekday",
        label: "Day of the week",
        type: "select",
        default: "1",
        showIf: (c) => c.frequency === "weekly",
        options: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((l, i) => ({
          value: String(i),
          label: l,
        })),
      },
      { key: "monthDay", label: "Day of the month", type: "number", default: 1, min: 1, max: 28, showIf: (c) => c.frequency === "monthly" },
      {
        key: "scope",
        label: "Run for",
        type: "select",
        default: "none",
        options: [
          { value: "none", label: "Once (no record)" },
          { value: "active_leases", label: "Each active lease" },
          { value: "tenants_with_balance", label: "Each tenant with a balance" },
        ],
      },
    ],
  },
];

export const getTrigger = (key) => TRIGGERS.find((t) => t.key === key) || null;

// Record type a trigger runs against (schedule depends on its scope).
export function triggerRecordType(key, config = {}) {
  if (key !== "schedule") return getTrigger(key)?.record || null;
  if (config.scope === "active_leases") return "lease";
  if (config.scope === "tenants_with_balance") return "tenant";
  return null;
}

// Older rules stored human labels in trigger_event.
const LEGACY_TRIGGERS = {
  "Rent overdue": "rent.overdue",
  "Lease expiring in 60 days": "lease.ending",
  "Work order created": "work_order.created",
  "Work order completed": "work_order.completed",
  "Application submitted": "application.submitted",
  "Move-out scheduled": "move_out.scheduled",
};
export const normalizeTriggerKey = (v) => LEGACY_TRIGGERS[v] || v || "";

export const triggerLabel = (key) => getTrigger(normalizeTriggerKey(key))?.label || key || "No trigger";

export const triggerDefaults = (key) =>
  Object.fromEntries((getTrigger(key)?.config || []).map((f) => [f.key, f.default]));

// --- Conditions --------------------------------------------------------------

export const CONDITION_FIELDS = {
  lease: [
    { key: "status", label: "Status", type: "text" },
    { key: "rent", label: "Rent", type: "number" },
    { key: "deposit", label: "Deposit", type: "number" },
    { key: "unit", label: "Unit", type: "text" },
    { key: "tenant_name", label: "Tenant name", type: "text" },
    { key: "term_end", label: "End date", type: "date" },
  ],
  application: [
    { key: "status", label: "Status", type: "text" },
    { key: "monthly_income", label: "Monthly income", type: "number" },
    { key: "score", label: "Score", type: "number" },
    { key: "source", label: "Source", type: "text" },
    { key: "unit", label: "Unit", type: "text" },
  ],
  work_order: [
    { key: "status", label: "Status", type: "text" },
    { key: "priority", label: "Priority", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "total_cost", label: "Total cost", type: "number" },
    { key: "vendor_name", label: "Vendor", type: "text" },
  ],
  transaction: [
    { key: "amount", label: "Amount", type: "number" },
    { key: "txn_type", label: "Type", type: "text" },
    { key: "account", label: "Account", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ],
  tenant: [
    { key: "status", label: "Status", type: "text" },
    { key: "balance", label: "Balance", type: "number" },
    { key: "unit", label: "Unit", type: "text" },
  ],
  move: [
    { key: "kind", label: "Kind (in / out)", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "unit", label: "Unit", type: "text" },
  ],
};

export const CONDITION_OPS = [
  { value: "equals", label: "is", needsValue: true },
  { value: "not_equals", label: "is not", needsValue: true },
  { value: "contains", label: "contains", needsValue: true },
  { value: "gt", label: "is greater than", needsValue: true },
  { value: "gte", label: "is at least", needsValue: true },
  { value: "lt", label: "is less than", needsValue: true },
  { value: "lte", label: "is at most", needsValue: true },
  { value: "is_set", label: "is set", needsValue: false },
  { value: "is_empty", label: "is empty", needsValue: false },
];

// Every rule must hold. Compares numerically when both sides parse as numbers.
export function evaluateConditions(rules, row) {
  if (!Array.isArray(rules) || !rules.length) return true;
  return rules.every((r) => {
    if (!r?.field || !r?.op) return true;
    const raw = row?.[r.field] ?? row?.metadata?.[r.field];
    const a = raw === null || raw === undefined ? "" : String(raw);
    const b = String(r.value ?? "");
    const na = Number(a);
    const nb = Number(b);
    const numeric = a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb);
    switch (r.op) {
      case "equals":
        return numeric ? na === nb : a.toLowerCase() === b.toLowerCase();
      case "not_equals":
        return numeric ? na !== nb : a.toLowerCase() !== b.toLowerCase();
      case "contains":
        return a.toLowerCase().includes(b.toLowerCase());
      case "gt":
        return numeric ? na > nb : a > b;
      case "gte":
        return numeric ? na >= nb : a >= b;
      case "lt":
        return numeric ? na < nb : a < b;
      case "lte":
        return numeric ? na <= nb : a <= b;
      case "is_set":
        return a !== "";
      case "is_empty":
        return a === "";
      default:
        return true;
    }
  });
}

// --- Steps -------------------------------------------------------------------

export const STEP_TYPES = [
  { key: "send_email", label: "Send a message", desc: "Email (or SMS) a template or custom text, merged with the record." },
  { key: "notify", label: "Notify the team", desc: "Log an internal notification on the record and email a teammate." },
  { key: "create_work_order", label: "Create a work order", desc: "Open a work order linked to the record's property and unit." },
  { key: "update_status", label: "Update status", desc: "Set the triggering record's status." },
  { key: "wait", label: "Wait", desc: "Pause the workflow for a number of days." },
];

export const getStepType = (key) => STEP_TYPES.find((s) => s.key === key) || null;

export const RECIPIENT_OPTIONS = [
  { value: "tenant", label: "The tenant" },
  { value: "applicant", label: "The applicant" },
  { value: "vendor", label: "The assigned vendor" },
  { value: "owner", label: "The property owner" },
  { value: "team", label: "Team alert recipients" },
  { value: "custom", label: "A specific email address" },
];

export const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"].map((v) => ({ value: v, label: v }));

export const stepDefaults = (type) => {
  switch (type) {
    case "send_email":
      return { recipient: "tenant", channel: "email", templateId: "", subject: "", body: "" };
    case "notify":
      return { message: "", memberId: "", emailTeam: false };
    case "create_work_order":
      return { name: "", priority: "Medium", category: "General", description: "" };
    case "update_status":
      return { status: "" };
    case "wait":
      return { days: 1 };
    default:
      return {};
  }
};

export function stepSummary(step) {
  const c = step?.config || {};
  switch (step?.type) {
    case "send_email":
      return `${String(c.channel || "email").toUpperCase() === "SMS" ? "SMS" : "Email"} ${
        RECIPIENT_OPTIONS.find((o) => o.value === c.recipient)?.label.toLowerCase() || "the tenant"
      }${c.subject ? ` — "${c.subject}"` : c.templateId ? " — from a template" : ""}`;
    case "notify":
      return c.message ? `Notify: ${c.message}` : "Notify the team";
    case "create_work_order":
      return c.name ? `Work order: ${c.name}` : "Create a work order";
    case "update_status":
      return c.status ? `Set status to ${c.status}` : "Update status";
    case "wait": {
      const d = Number(c.days) || 0;
      return `Wait ${d} day${d === 1 ? "" : "s"}`;
    }
    default:
      return getStepType(step?.type)?.label || "Step";
  }
}

const sid = (i) => `step-${i + 1}`;
const steps = (list) => list.map(([type, config], i) => ({ id: sid(i), type, config: { ...stepDefaults(type), ...config } }));

// Built-in starter workflows.
export const BUILT_IN_WORKFLOWS = [
  {
    key: "move_in",
    name: "Move-in welcome",
    desc: "Welcome the resident, prep the unit, and check in after the first week.",
    triggerEvent: "move_in.scheduled",
    trigger: {},
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "Welcome to {{property}}",
          body:
            "Hi {{tenant_first_name}},\n\nWe're looking forward to your move into {{unit}}. Rent of {{rent}} is due on {{due_date}}, and your portal is ready for payments and maintenance requests.\n\nReply to this email with any questions before move-in day.\n\n{{company_name}}",
        },
      ],
      ["notify", { message: "Move-in scheduled for {{unit}} — confirm keys, utilities and the move-in inspection.", emailTeam: true }],
      ["create_work_order", { name: "Move-in inspection — {{unit}}", priority: "Medium", category: "Inspection" }],
      ["wait", { days: 7 }],
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "How's the first week at {{property}}?",
          body: "Hi {{tenant_first_name}},\n\nYou've had a week in {{unit}} — is everything working as it should? Reply here or submit a maintenance request from your portal.\n\n{{company_name}}",
        },
      ],
    ]),
  },
  {
    key: "move_out",
    name: "Move-out checklist",
    desc: "Send move-out instructions, schedule the inspection, and start the turn.",
    triggerEvent: "move_out.scheduled",
    trigger: {},
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "Your move-out from {{unit}}",
          body:
            "Hi {{tenant_first_name}},\n\nWe've scheduled your move-out from {{unit}}. Please leave the unit clean, return all keys, and send us a forwarding address so we can return your deposit.\n\n{{company_name}}",
        },
      ],
      ["create_work_order", { name: "Move-out inspection — {{unit}}", priority: "High", category: "Inspection" }],
      ["notify", { message: "Move-out scheduled for {{unit}} — plan the unit turn and deposit disposition.", emailTeam: true }],
    ]),
  },
  {
    key: "collections",
    name: "Collections follow-up",
    desc: "Remind residents with an overdue balance, then escalate to the team.",
    triggerEvent: "rent.overdue",
    trigger: { daysOverdue: 5, minBalance: 1 },
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "Your balance of {{balance_due}} is past due",
          body:
            "Hi {{tenant_first_name}},\n\nOur records show a balance of {{balance_due}} on {{unit}}. Please pay through your portal as soon as possible to avoid further late fees.\n\nIf you've already paid, thank you — you can ignore this message.\n\n{{company_name}}",
        },
      ],
      ["wait", { days: 5 }],
      ["notify", { message: "{{tenant_name}} ({{unit}}) still owes {{balance_due}} — follow up or serve a notice.", emailTeam: true }],
    ]),
  },
  {
    key: "application_received",
    name: "Application received",
    desc: "Confirm receipt to the applicant and flag the new application to the team.",
    triggerEvent: "application.submitted",
    trigger: {},
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "applicant",
          subject: "We received your application for {{unit}}",
          body: "Hi {{recipient_name}},\n\nThanks for applying for {{unit}}. We're reviewing your application and screening results now, and we'll be in touch within two business days.\n\n{{company_name}}",
        },
      ],
      ["notify", { message: "New application for {{unit}} — review the screening results.", emailTeam: true }],
    ]),
  },
  {
    key: "application_approved",
    name: "Approved applicant next steps",
    desc: "Tell approved applicants what happens next and start the lease paperwork.",
    triggerEvent: "application.approved",
    trigger: {},
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "applicant",
          subject: "You're approved for {{unit}}",
          body: "Hi {{recipient_name}},\n\nGood news — your application for {{unit}} has been approved. We'll send your lease for e-signature shortly, along with the deposit and move-in details.\n\n{{company_name}}",
        },
      ],
      ["notify", { message: "Application approved for {{unit}} — prepare and send the lease.", emailTeam: true }],
    ]),
  },
  {
    key: "lease_kickoff",
    name: "New lease kickoff",
    desc: "Remind the team to collect the deposit and book the move-in when a lease is added.",
    triggerEvent: "lease.created",
    trigger: {},
    conditionRules: [],
    steps: steps([
      ["notify", { message: "{{lease_name}} created — collect the {{deposit}} deposit and schedule the move-in.", emailTeam: true }],
    ]),
  },
  {
    key: "request_received",
    name: "Maintenance request received",
    desc: "Acknowledge a new request to the resident and alert the maintenance team.",
    triggerEvent: "work_order.created",
    trigger: {},
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "We've got your maintenance request",
          body: "Hi {{tenant_first_name}},\n\nThanks for letting us know. Your request for {{unit}} is logged and we'll confirm a visit time once a vendor is assigned.\n\n{{company_name}}",
        },
      ],
      ["notify", { message: "New work order for {{unit}} — assign a vendor.", emailTeam: true }],
    ]),
  },
  {
    key: "repair_follow_up",
    name: "Repair follow-up",
    desc: "Check in with the resident a couple of days after a work order is completed.",
    triggerEvent: "work_order.completed",
    trigger: {},
    conditionRules: [],
    steps: steps([
      ["wait", { days: 2 }],
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "How did the repair go?",
          body: "Hi {{tenant_first_name}},\n\nWe recently closed a work order for {{unit}}. Is everything working as it should? Reply here if anything still needs attention.\n\n{{company_name}}",
        },
      ],
    ]),
  },
  {
    key: "payment_thanks",
    name: "Payment thank-you",
    desc: "Thank residents when a payment is recorded and confirm their remaining balance.",
    triggerEvent: "payment.received",
    trigger: {},
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "Thanks — we received your payment",
          body: "Hi {{tenant_first_name}},\n\nWe've received your payment for {{unit}}. Your balance is now {{balance}}.\n\n{{company_name}}",
        },
      ],
    ]),
  },
  {
    key: "rent_reminder",
    name: "Monthly rent reminder",
    desc: "Remind every resident with an active lease that rent is due next week.",
    triggerEvent: "schedule",
    trigger: { frequency: "monthly", monthDay: 25, scope: "active_leases" },
    conditionRules: [],
    steps: steps([
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "Rent for {{unit}} is due {{due_date}}",
          body: "Hi {{tenant_first_name}},\n\nA friendly reminder that rent of {{rent}} for {{unit}} is due on {{due_date}}. You can pay or set up autopay from your resident portal.\n\n{{company_name}}",
        },
      ],
    ]),
  },
  {
    key: "renewal",
    name: "Renewal outreach",
    desc: "Open the renewal conversation ahead of the lease end and follow up.",
    triggerEvent: "lease.ending",
    trigger: { daysBefore: 90 },
    conditionRules: [],
    steps: steps([
      ["notify", { message: "{{lease_name}} ends {{lease_end}} — prepare a renewal offer.", emailTeam: true }],
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "Your lease at {{property}} ends {{lease_end}}",
          body:
            "Hi {{tenant_first_name}},\n\nYour lease for {{unit}} ends on {{lease_end}}. We'd love to have you stay — we'll send renewal options shortly. Let us know your plans by replying to this email.\n\n{{company_name}}",
        },
      ],
      ["wait", { days: 30 }],
      [
        "send_email",
        {
          recipient: "tenant",
          subject: "Checking in on your renewal",
          body: "Hi {{tenant_first_name}},\n\nYour lease for {{unit}} ends on {{lease_end}} ({{days_until_lease_end}} days). Have you decided whether you'll renew?\n\n{{company_name}}",
        },
      ],
    ]),
  },
];

// A built-in starter's trigger group (Leases, Applications…), used to categorise the template gallery.
export const builtInGroup = (tpl) => getTrigger(tpl.triggerEvent)?.group || "Schedule";

// The automations row a built-in starter creates: a disabled Draft with fresh step ids, so it's reviewed before it runs.
export const builtInWorkflowRow = (tpl, id) => ({
  id,
  name: tpl.name,
  triggerEvent: tpl.triggerEvent,
  actionType: "workflow",
  enabled: false,
  status: "Draft",
  metadata: {
    trigger: { ...triggerDefaults(tpl.triggerEvent), ...tpl.trigger },
    conditionRules: tpl.conditionRules,
    steps: tpl.steps.map((s) => ({ ...s, id: crypto.randomUUID() })),
    builtIn: tpl.key,
  },
});
