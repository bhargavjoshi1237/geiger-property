// Automation workflow catalog (isomorphic, plain data): triggers, the record
// types they fire on, condition fields/operators, step (action) types and the
// built-in starter workflows. Definitions live on property.automations:
// trigger_event = trigger key, metadata.trigger = trigger config,
// metadata.conditionRules = [{ field, op, value }] (or metadata.conditions =
// { op: "and" | "or", rules: [rule | group] }), metadata.steps = [{ id, type, config }],
// autonomy (column) + metadata.autonomyConfig.

export const RECORD_TYPES = {
  lease: { table: "leases", ownerType: "lease", label: "Lease", titleCols: ["name", "tenant_name"] },
  application: { table: "applications", ownerType: "application", label: "Application", titleCols: ["applicant_name", "name"] },
  work_order: { table: "work_orders", ownerType: "workorder", label: "Work order", titleCols: ["name"] },
  transaction: { table: "transactions", ownerType: "transaction", label: "Payment", titleCols: ["name", "payee"] },
  online_payment: { table: "online_payments", ownerType: "online_payment", label: "Online payment", titleCols: ["description", "payer_name"] },
  tenant: { table: "tenants", ownerType: "tenant", label: "Tenant", titleCols: ["name"] },
  move: { table: "moves", ownerType: "move", label: "Move", titleCols: ["name", "tenant_name"] },
  vendor: { table: "vendors", ownerType: "vendor", label: "Vendor", titleCols: ["name"] },
  bill: { table: "bills", ownerType: "bill", label: "Bill", titleCols: ["name", "vendor_name"] },
  // Office payments emit payment.received on their ledger entry (CORE-11); a ledger entry never changes status from a workflow.
  ledger_payment: { table: "ledger_entries", ownerType: "ledger_entry", label: "Office payment", titleCols: ["memo"], readOnly: true },
};

export const TABLE_RECORD_TYPE = Object.fromEntries(
  Object.entries(RECORD_TYPES).map(([k, v]) => [v.table, k]),
);

export const recordTitle = (type, row) => {
  const cols = RECORD_TYPES[type]?.titleCols || ["name"];
  for (const c of cols) if (row?.[c]) return String(row[c]);
  return RECORD_TYPES[type]?.label || "Record";
};

export const TRIGGER_GROUPS = ["Leases", "Applications", "Maintenance", "Rent & payments", "Moves", "Vendors", "Schedule", "Manual"];

const YES_NO = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

// Record types a manual ("Run by hand") workflow can run on.
export const MANUAL_RECORD_TYPES = ["tenant", "lease", "work_order", "application", "move", "vendor"];

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
  { key: "application.submitted", label: "Application submitted", group: "Applications", record: "application", module: "leasing", desc: "A rental application is received." },
  { key: "application.approved", label: "Application approved", group: "Applications", record: "application", module: "leasing", desc: "An application's status becomes Approved." },
  {
    key: "maintenance_request.created",
    label: "Maintenance request received",
    group: "Maintenance",
    record: "work_order",
    desc: "A resident (portal or email) or a teammate submits a maintenance request.",
  },
  { key: "work_order.created", label: "Work order created", group: "Maintenance", record: "work_order", desc: "A new work order is opened, or a request is converted into one." },
  { key: "work_order.completed", label: "Work order completed", group: "Maintenance", record: "work_order", desc: "A work order's status becomes Completed." },
  {
    key: "work_order.overdue",
    label: "Work order overdue",
    group: "Maintenance",
    record: "work_order",
    timed: true,
    desc: "Once per work order when it's still unassigned after the window, and again if it passes its due date.",
    config: [
      { key: "unassignedHours", label: "Unassigned for (hours)", type: "number", default: 4, min: 1 },
      {
        key: "priorities",
        label: "Priorities watched",
        type: "select",
        default: "urgent_high",
        options: [
          { value: "urgent_high", label: "Urgent and high" },
          { value: "all", label: "Every priority" },
        ],
      },
      { key: "pastDue", label: "Also when past the due date", type: "select", default: "yes", options: YES_NO },
    ],
  },
  { key: "payment.received", label: "Payment received", group: "Rent & payments", record: "transaction", desc: "An income transaction is recorded against a tenant or lease." },
  { key: "payment.returned", label: "Payment returned", group: "Rent & payments", record: "transaction", desc: "A payment comes back unpaid: an office check (NSF, closed account, stop payment, CORE-17) or an online bank payment." },
  {
    key: "rent.overdue",
    label: "Rent overdue",
    group: "Rent & payments",
    record: "tenant",
    timed: true,
    desc: "Once a month per tenant whose lease balance on the ledger has a charge open this many days.",
    config: [
      { key: "daysOverdue", label: "Days the oldest open charge is past due", type: "number", default: 5, min: 1 },
      { key: "minBalance", label: "Minimum balance ($)", type: "number", default: 1, min: 0 },
    ],
  },
  { key: "autopay.failed", label: "Autopay failed", group: "Rent & payments", record: "online_payment", desc: "An autopay charge is declined or returned." },
  { key: "move_in.scheduled", label: "Move-in scheduled", group: "Moves", record: "move", desc: "A move-in gets a date." },
  { key: "move_out.scheduled", label: "Move-out scheduled", group: "Moves", record: "move", desc: "A move-out gets a date." },
  {
    key: "vendor.compliance_expiring",
    label: "Vendor document expiring",
    group: "Vendors",
    record: "vendor",
    timed: true,
    desc: "Once per vendor COI or licence when it comes within the window, and again when it expires.",
    config: [{ key: "daysBefore", label: "Days before expiry", type: "number", default: 30, min: 1 }],
  },
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
  {
    key: "manual",
    label: "Run by hand",
    group: "Manual",
    record: null,
    desc: "Never fires on its own — started from a record, a signal, or the review queue, after a preview.",
    config: [
      {
        key: "recordType",
        label: "Runs on",
        type: "select",
        default: "tenant",
        options: MANUAL_RECORD_TYPES.map((t) => ({ value: t, label: RECORD_TYPES[t].label })),
      },
    ],
  },
];

export const getTrigger = (key) => TRIGGERS.find((t) => t.key === key) || null;

// Record type a trigger runs against (schedule depends on its scope, manual on its config).
export function triggerRecordType(key, config = {}) {
  if (key === "manual") return MANUAL_RECORD_TYPES.includes(config.recordType) ? config.recordType : "tenant";
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

// Settings → Modules key a trigger names with `module` (null for core); the runner skips it where that module is off.
export const triggerModule = (key) => getTrigger(normalizeTriggerKey(key))?.module || null;

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
    { key: "kind", label: "Kind (request / work_order)", type: "text" },
    { key: "source", label: "Source (tenant, staff, email…)", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "priority", label: "Priority", type: "text" },
    { key: "category", label: "Category", type: "text" },
    { key: "name", label: "Title", type: "text" },
    { key: "description", label: "Description", type: "text" },
    { key: "total_cost", label: "Total cost", type: "number" },
    { key: "vendor_name", label: "Vendor", type: "text" },
  ],
  transaction: [
    { key: "amount", label: "Amount", type: "number" },
    { key: "txn_type", label: "Type", type: "text" },
    { key: "account", label: "Account", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ],
  online_payment: [
    { key: "amount", label: "Amount", type: "number" },
    { key: "method", label: "Method", type: "text" },
    { key: "source", label: "Source", type: "text" },
    { key: "status", label: "Status", type: "text" },
  ],
  tenant: [
    { key: "status", label: "Status", type: "text" },
    { key: "balance", label: "Balance", type: "number" },
    { key: "unit", label: "Unit", type: "text" },
    { key: "email", label: "Email", type: "text" },
  ],
  move: [
    { key: "kind", label: "Kind (in / out)", type: "text" },
    { key: "status", label: "Status", type: "text" },
    { key: "unit", label: "Unit", type: "text" },
  ],
  vendor: [
    { key: "status", label: "Status", type: "text" },
    { key: "specialty", label: "Trade", type: "text" },
    { key: "name", label: "Name", type: "text" },
  ],
  bill: [
    { key: "amount", label: "Amount", type: "number" },
    { key: "status", label: "Status", type: "text" },
    { key: "approval_status", label: "Approval", type: "text" },
    { key: "vendor_name", label: "Vendor", type: "text" },
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

export const conditionFieldLabel = (recordType, field) =>
  (CONDITION_FIELDS[recordType] || []).find((f) => f.key === field)?.label || String(field || "").replace(/_/g, " ");

// A v1 rules array reads as an AND group (PLAT-13 conditions v2).
export function conditionGroup(value) {
  if (Array.isArray(value)) return { op: "and", rules: value };
  if (value && typeof value === "object" && Array.isArray(value.rules)) return { op: value.op === "or" ? "or" : "and", rules: value.rules };
  return { op: "and", rules: [] };
}

// A workflow's conditions: metadata.conditions (v2 groups) when set, else metadata.conditionRules.
export const workflowConditions = (meta = {}) =>
  meta?.conditions && Array.isArray(meta.conditions.rules) ? conditionGroup(meta.conditions) : conditionGroup(meta?.conditionRules);

const fieldValue = (row, field) => row?.[field] ?? row?.metadata?.[field];

// One rule against a row. Compares numerically when both sides parse as numbers.
function explainRule(rule, row, recordType) {
  const raw = fieldValue(row, rule.field);
  const a = raw === null || raw === undefined ? "" : String(raw);
  const b = String(rule.value ?? "");
  const na = Number(a);
  const nb = Number(b);
  const numeric = a !== "" && b !== "" && !Number.isNaN(na) && !Number.isNaN(nb);
  let passed;
  switch (rule.op) {
    case "equals":
      passed = numeric ? na === nb : a.toLowerCase() === b.toLowerCase();
      break;
    case "not_equals":
      passed = numeric ? na !== nb : a.toLowerCase() !== b.toLowerCase();
      break;
    case "contains":
      passed = a.toLowerCase().includes(b.toLowerCase());
      break;
    case "gt":
      passed = numeric ? na > nb : a > b;
      break;
    case "gte":
      passed = numeric ? na >= nb : a >= b;
      break;
    case "lt":
      passed = numeric ? na < nb : a < b;
      break;
    case "lte":
      passed = numeric ? na <= nb : a <= b;
      break;
    case "is_set":
      passed = a !== "";
      break;
    case "is_empty":
      passed = a === "";
      break;
    default:
      passed = true;
  }
  const op = CONDITION_OPS.find((o) => o.value === rule.op);
  return {
    field: rule.field,
    label: conditionFieldLabel(recordType, rule.field),
    op: rule.op,
    opLabel: op?.label || rule.op,
    expected: op?.needsValue === false ? null : b,
    actual: a,
    passed,
  };
}

// Why a row matched (or didn't): { op, matched, results: [rule result | nested group] }.
export function explainConditions(rulesOrGroup, row, recordType) {
  const group = conditionGroup(rulesOrGroup);
  const results = group.rules
    .filter((r) => r && (Array.isArray(r.rules) || (r.field && r.op)))
    .map((r) => (Array.isArray(r.rules) ? { group: true, ...explainConditions(r, row, recordType) } : explainRule(r, row, recordType)));
  const ok = (r) => (r.group ? r.matched : r.passed);
  const matched = !results.length || (group.op === "or" ? results.some(ok) : results.every(ok));
  return { op: group.op, matched, results };
}

// Every rule must hold (AND), or any for an "or" group.
export function evaluateConditions(rules, row) {
  return explainConditions(rules, row).matched;
}

// --- Steps -------------------------------------------------------------------

// Gating categories (ORCH-05): what kind of side effect a step has.
export const STEP_CATEGORIES = {
  money: "Charges",
  legal: "Legal notices",
  message: "Messages",
  record: "Record changes",
  internal: "Internal notes & tasks",
  control: "Flow control",
};
export const SIDE_EFFECT_CATEGORIES = ["money", "legal", "message", "record"];

export const STEP_TYPES = [
  { key: "send_email", label: "Send a message", category: "message", desc: "Email (or SMS) a template or custom text, merged with the record." },
  { key: "notify", label: "Notify the team", category: "internal", desc: "Log an internal notification on the record and email a teammate." },
  { key: "create_work_order", label: "Create a work order", category: "record", desc: "Open a work order linked to the record's property and unit." },
  { key: "update_status", label: "Update status", category: "record", desc: "Set the triggering record's status." },
  { key: "assign", label: "Assign a vendor", category: "record", desc: "Assign the work order to a set vendor, or the best compliant match for its trade." },
  { key: "post_charge", label: "Post a charge", category: "money", desc: "Post a charge or late fee to the tenant's ledger — once per run, never twice." },
  { key: "create_task", label: "Create a task", category: "internal", desc: "Put a task with a due date in the Review Queue, or escalate the record to a person." },
  { key: "request_approval", label: "Ask for approval", category: "control", desc: "Pause until someone approves in the Review Queue; rejecting stops the run." },
  { key: "branch", label: "If / otherwise", category: "control", desc: "Check a condition on the record as it is now; stop, or skip ahead, when it doesn't hold." },
  { key: "wait", label: "Wait", category: "control", desc: "Pause the workflow for a number of days." },
  // Playbook steps: added by playbooks, not offered in the step palette.
  { key: "month_end_checks", label: "Run month-end checks", category: "internal", playbookOnly: true, desc: "Check close readiness and raise one review item per blocker." },
  { key: "owner_digest", label: "Send owner digest", category: "message", playbookOnly: true, desc: "Email each owner a KPI digest for their properties." },
];

export const PALETTE_STEP_TYPES = STEP_TYPES.filter((s) => !s.playbookOnly);

export const getStepType = (key) => STEP_TYPES.find((s) => s.key === key) || null;

// A send_email step flagged as a legal notice gates as "legal" rather than "message".
export const stepCategory = (step) =>
  step?.type === "send_email" && step?.config?.category === "legal" ? "legal" : getStepType(step?.type)?.category || "internal";

export const isSideEffectStep = (step) => SIDE_EFFECT_CATEGORIES.includes(stepCategory(step));

export const RECIPIENT_OPTIONS = [
  { value: "tenant", label: "The tenant" },
  { value: "applicant", label: "The applicant" },
  { value: "vendor", label: "The assigned vendor" },
  { value: "owner", label: "The property owner" },
  { value: "team", label: "Team alert recipients" },
  { value: "custom", label: "A specific email address" },
];

export const MESSAGE_CATEGORY_OPTIONS = [
  { value: "message", label: "Reminder or update" },
  { value: "legal", label: "Legal notice" },
  { value: "emergency", label: "Emergency" },
];

export const PRIORITY_OPTIONS = ["Low", "Medium", "High", "Urgent"].map((v) => ({ value: v, label: v }));

export const CHARGE_KIND_OPTIONS = [
  { value: "late_fee", label: "Late fee" },
  { value: "charge", label: "Other charge" },
];

export const CHARGE_AMOUNT_OPTIONS = [
  { value: "fixed", label: "A fixed amount" },
  { value: "late_fee_policy", label: "The late fee in Fees & Policies" },
];

export const ASSIGN_MODE_OPTIONS = [
  { value: "best_match", label: "Best compliant vendor for the trade" },
  { value: "vendor", label: "A specific vendor" },
];

export const BRANCH_OTHERWISE_OPTIONS = [
  { value: "stop", label: "Stop the run" },
  { value: "skip", label: "Skip the next steps" },
];

export const stepDefaults = (type) => {
  switch (type) {
    case "send_email":
      return { recipient: "tenant", channel: "email", category: "message", templateId: "", subject: "", body: "" };
    case "notify":
      return { message: "", memberId: "", emailTeam: false };
    case "create_work_order":
      return { name: "", priority: "Medium", category: "General", description: "" };
    case "update_status":
      return { status: "" };
    case "assign":
      return { mode: "best_match", vendorId: "" };
    case "post_charge":
      return { kind: "late_fee", amountType: "fixed", amount: 50, memo: "" };
    case "create_task":
      return { title: "", note: "", dueInDays: 1, memberId: "", escalate: false };
    case "request_approval":
      return { title: "", note: "", approverRole: "" };
    case "branch":
      return { conditions: { op: "and", rules: [] }, otherwise: "stop", skip: 1 };
    case "wait":
      return { days: 1 };
    case "month_end_checks":
      return { checks: [] };
    case "owner_digest":
      return { subject: "", note: "" };
    default:
      return {};
  }
};

const money = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function stepSummary(step) {
  const c = step?.config || {};
  switch (step?.type) {
    case "send_email":
      return `${c.category === "legal" ? "Legal notice — " : ""}${String(c.channel || "email").toUpperCase() === "SMS" ? "SMS" : "Email"} ${
        RECIPIENT_OPTIONS.find((o) => o.value === c.recipient)?.label.toLowerCase() || "the tenant"
      }${c.subject ? ` — "${c.subject}"` : c.templateId ? " — from a template" : ""}`;
    case "notify":
      return c.message ? `Notify: ${c.message}` : "Notify the team";
    case "create_work_order":
      return c.name ? `Work order: ${c.name}` : "Create a work order";
    case "update_status":
      return c.status ? `Set status to ${c.status}` : "Update status";
    case "assign":
      return c.mode === "vendor" ? "Assign a set vendor" : "Assign the best vendor for the trade";
    case "post_charge": {
      const what = c.kind === "late_fee" ? "late fee" : "charge";
      return c.amountType === "late_fee_policy" ? `Post the policy ${what}` : `Post a ${money(c.amount)} ${what}`;
    }
    case "create_task":
      return `${c.escalate ? "Escalate" : "Task"}: ${c.title || "follow up"}${Number(c.dueInDays) ? ` (due in ${c.dueInDays}d)` : ""}`;
    case "request_approval":
      return c.title ? `Approval: ${c.title}` : "Ask for approval";
    case "branch": {
      const n = conditionGroup(c.conditions).rules.length;
      const then = c.otherwise === "skip" ? `skip ${Number(c.skip) || 1} step${Number(c.skip) === 1 ? "" : "s"}` : "stop";
      return `If ${n ? `${n} condition${n === 1 ? "" : "s"} hold` : "always"}, otherwise ${then}`;
    }
    case "wait": {
      const d = Number(c.days) || 0;
      return `Wait ${d} day${d === 1 ? "" : "s"}`;
    }
    default:
      return getStepType(step?.type)?.label || "Step";
  }
}

// --- Autonomy defaults (ORCH-05 open decision 4) -----------------------------

// New and playbook-installed workflows ask first for money and legal steps; everything else runs.
export const DEFAULT_AUTONOMY = "approve";
export const defaultAutonomyConfig = () => ({ appliesTo: ["money", "legal"], threshold: 0, approverRole: "" });

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
    triggerEvent: "maintenance_request.created",
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
      ["notify", { message: "New maintenance request for {{unit}} — review it and assign a vendor.", emailTeam: true }],
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
  autonomy: DEFAULT_AUTONOMY,
  metadata: {
    trigger: { ...triggerDefaults(tpl.triggerEvent), ...tpl.trigger },
    conditionRules: tpl.conditionRules,
    steps: tpl.steps.map((s) => ({ ...s, id: crypto.randomUUID() })),
    autonomyConfig: defaultAutonomyConfig(),
    builtIn: tpl.key,
  },
});
