import { PREREQS, autonomyDefaults, autonomyFor, autonomyStep, clampDay, num, steps } from "./shared";

// Accounting and owner playbooks: month-end close checklist, owner statements and payouts, weekly owner digest.

export const CLOSE_CHECKS = [
  { value: "unreconciled_banks", label: "Bank accounts not reconciled in 35 days" },
  { value: "pending_bills", label: "Bills waiting for approval" },
  { value: "unposted_recurring", label: "Recurring charges not posted for the month" },
  { value: "deposits_overdue", label: "Deposits past their return deadline" },
  { value: "trust_shortfall", label: "Trust accounts in shortfall" },
];

export const monthEndClose = {
  key: "month_end_close",
  version: 2,
  area: "Accounting",
  title: "Month-end close checklist",
  outcome: "Close the books knowing nothing is missing.",
  description:
    "Early each month it checks the previous month for blockers — unreconciled banks, bills waiting for approval, unposted recurring charges, overdue deposit returns, trust shortfalls — and raises one review item per blocker. Once you approve, it locks the month in the books when every close check passes; otherwise it hands you the close.",
  prerequisites: [PREREQS.bankAccounts, PREREQS.periodClose],
  defaultAutonomy: "auto",
  kpis: ["ap_due", "unapproved_bills", "trust_shortfall"],
  signals: ["bank_unreconciled", "bills_attention", "deposit_return_due"],
  changes: { 1: ["First version."], 2: ["After approval it closes the month in the books (period close), still asking first."] },

  defaults: () => ({ runDay: 3, checks: CLOSE_CHECKS.map((c) => c.value), ...autonomyDefaults("auto") }),

  questions: () => [
    {
      key: "checks",
      title: "Checks",
      fields: [
        { key: "runDay", label: "Run on day of the month", type: "number", min: 1, max: 28, required: true },
        { key: "checks", label: "Blockers to check", type: "multiselect", options: CLOSE_CHECKS, full: true, required: true },
      ],
    },
    autonomyStep("auto"),
  ],

  workflows(config) {
    const c = { ...monthEndClose.defaults(), ...config };
    const checks = Array.isArray(c.checks) && c.checks.length ? c.checks : CLOSE_CHECKS.map((x) => x.value);
    return [
      {
        key: "close",
        name: "Month-end close checklist",
        description: "Readiness checks, approval, then the period close.",
        triggerEvent: "schedule",
        trigger: { frequency: "monthly", monthDay: clampDay(num(c.runDay, 3)), scope: "none" },
        steps: steps("close", [
          ["month_end_checks", { checks, period: "previous" }],
          ["request_approval", { title: "Approve last month's close", note: "Resolve the blocker items raised by the checklist, then approve to lock last month in the books." }],
          ["close_period", { period: "previous" }],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, monthEndClose) }));
  },
};

export const ownerStatementsPayouts = {
  key: "owner_statements_payouts",
  version: 1,
  area: "Managing agents",
  title: "Owner statements and payouts",
  outcome: "Owners get their statement and their money on the same day every month.",
  description: "Prepare owner statements, approve them, send them, then run the payout batch.",
  prerequisites: [PREREQS.owners, PREREQS.email, PREREQS.payoutsProvider],
  defaultAutonomy: "approve",
  kpis: ["trust_shortfall"],
  signals: [],
  changes: { 1: ["First version."] },
  defaults: () => autonomyDefaults("approve"),
  questions: () => [autonomyStep("approve")],
  workflows: () => [],
};

export const weeklyOwnerDigest = {
  key: "weekly_owner_digest",
  version: 1,
  area: "Analytics",
  title: "Weekly owner and portfolio digest",
  outcome: "Owners see how their properties are doing every week without asking.",
  description: "Every week each owner gets a short KPI email for their properties — occupancy, rent collected, delinquency and open work — computed from the same metrics as your Overview.",
  prerequisites: [PREREQS.owners, PREREQS.email],
  defaultAutonomy: "auto",
  kpis: ["occupancy", "collection_rate", "delinquent_balance", "open_work_orders"],
  signals: [],
  changes: { 1: ["First version."] },

  defaults: () => ({ weekday: "1", note: "", ...autonomyDefaults("auto") }),

  questions: () => [
    {
      key: "digest",
      title: "Digest",
      fields: [
        {
          key: "weekday",
          label: "Send on",
          type: "select",
          options: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"].map((l, i) => ({ value: String(i), label: l })),
        },
        { key: "note", label: "A line to add to every digest (optional)", type: "textarea", full: true },
      ],
    },
    autonomyStep("auto"),
  ],

  workflows(config) {
    const c = { ...weeklyOwnerDigest.defaults(), ...config };
    return [
      {
        key: "digest",
        name: "Weekly owner digest",
        description: "A KPI email per owner for their properties.",
        triggerEvent: "schedule",
        trigger: { frequency: "weekly", weekday: String(c.weekday ?? "1"), scope: "none" },
        steps: steps("digest", [["owner_digest", { subject: "Your weekly property update", note: c.note || "" }]]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, weeklyOwnerDigest) }));
  },
};
