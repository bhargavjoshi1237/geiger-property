import { PREREQS, autonomyDefaults, autonomyFor, autonomyStep, clampDay, num, propertyConditions, scopeStep, steps, usd } from "./shared";

// Collections ladder: reminder before the due date, a due-day notice, a day-1 late notice, the late fee on the
// policy day (shares the late-fees job's key, so a month is never charged twice), escalation to the review
// queue, and a demand letter that waits for approval (legal notices ask first by default).

const BALANCE = (min) => ({ op: "and", rules: [{ field: "balance", op: "gte", value: String(min) }] });

export const collectionsLadder = {
  key: "collections_ladder",
  version: 1,
  area: "Collections",
  title: "Collections ladder",
  outcome: "Get paid on time, with fees and escalation applied the same way every month.",
  description:
    "A reminder before rent is due, a due-day notice, a late notice the day after, the late fee on your policy day, a review item for anyone still owing on day 10, and a demand letter for approval on day 30.",
  prerequisites: [PREREQS.email],
  defaultAutonomy: "approve",
  kpis: ["collection_rate", "delinquent_balance", "delinquent_accounts"],
  signals: ["rent_delinquency", "collection_rate_drop"],
  changes: { 1: ["First version."] },

  defaults: (ctx) => ({
    dueDay: clampDay(ctx?.policies?.rentDueDay || 1),
    reminderDaysBefore: 3,
    feeDay: num(ctx?.policies?.graceDays, 5) || 5,
    feeMode: "fixed",
    feeAmount: num(ctx?.policies?.lateFeeAmount, 50) || 50,
    escalateDay: 10,
    demandDay: 30,
    minBalance: 1,
    ...autonomyDefaults("approve"),
  }),

  questions: (ctx) => [
    {
      key: "schedule",
      title: "Schedule",
      description: "Days count from the rent due date.",
      fields: [
        { key: "dueDay", label: "Rent is due on day", type: "number", min: 1, max: 28, required: true },
        { key: "reminderDaysBefore", label: "Remind this many days before", type: "number", min: 1, max: 10 },
        { key: "feeDay", label: "Charge the late fee on day (late)", type: "number", min: 1, required: true },
        { key: "escalateDay", label: "Escalate to the review queue on day", type: "number", min: 2, required: true },
        { key: "demandDay", label: "Draft a demand letter on day", type: "number", min: 3, required: true },
        { key: "minBalance", label: "Only when the balance is at least", type: "currency" },
      ],
      validate: (v) =>
        num(v.feeDay, 0) < 1
          ? "The late fee day must be at least 1."
          : num(v.escalateDay, 0) <= num(v.feeDay, 0)
            ? "Escalate after the late fee day."
            : num(v.demandDay, 0) <= num(v.escalateDay, 0)
              ? "The demand letter comes after the escalation."
              : null,
    },
    {
      key: "fee",
      title: "Late fee",
      fields: [
        {
          key: "feeMode",
          label: "Late fee amount",
          type: "select",
          options: [
            { value: "fixed", label: "A fixed amount" },
            { value: "policy", label: "Whatever Fees & Policies says for each lease" },
          ],
          full: true,
        },
        { key: "feeAmount", label: "Late fee", type: "currency", showIf: (v) => v.feeMode !== "policy", required: true },
      ],
    },
    scopeStep(ctx),
    autonomyStep("approve"),
  ],

  workflows(config) {
    const c = { ...collectionsLadder.defaults({}), ...config };
    const dueDay = clampDay(c.dueDay);
    const before = Math.max(1, num(c.reminderDaysBefore, 3));
    const reminderDay = dueDay - before >= 1 ? dueDay - before : Math.max(1, 28 + dueDay - before);
    const feeDay = Math.max(1, num(c.feeDay, 5));
    const escalateDay = Math.max(feeDay + 1, num(c.escalateDay, 10));
    const demandDay = Math.max(escalateDay + 1, num(c.demandDay, 30));
    const minBalance = Math.max(0, num(c.minBalance, 1));
    const scope = propertyConditions(c);
    const fee = c.feeMode === "policy" ? { amountType: "late_fee_policy" } : { amountType: "fixed", amount: num(c.feeAmount, 50) };
    const feeLabel = c.feeMode === "policy" ? "the late fee in your lease" : `a ${usd(fee.amount)} late fee`;

    return [
      {
        key: "reminder",
        name: "Collections ladder · Rent reminder",
        description: `Reminds every active lease ${before} day${before === 1 ? "" : "s"} before rent is due.`,
        triggerEvent: "schedule",
        trigger: { frequency: "monthly", monthDay: reminderDay, scope: "active_leases" },
        ...scope,
        steps: steps("reminder", [
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
        key: "due_day",
        name: "Collections ladder · Due-day notice",
        description: "Tells residents with an open balance that rent is due today.",
        triggerEvent: "schedule",
        trigger: { frequency: "monthly", monthDay: dueDay, scope: "tenants_with_balance" },
        ...scope,
        steps: steps("due_day", [
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "Rent is due today",
              body: "Hi {{tenant_first_name}},\n\nRent for {{unit}} is due today. Your current balance is {{balance_due}}. Pay from your resident portal to stay current.\n\n{{company_name}}",
            },
          ],
        ]),
      },
      {
        key: "late",
        name: "Collections ladder · Late notice, fee and escalation",
        description: `Day 1 late notice, ${feeLabel} on day ${feeDay}, review on day ${escalateDay}, demand letter for approval on day ${demandDay}.`,
        triggerEvent: "rent.overdue",
        trigger: { daysOverdue: 1, minBalance },
        ...scope,
        steps: steps("late", [
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "Your rent for {{unit}} is past due",
              body: "Hi {{tenant_first_name}},\n\nWe haven't received this month's rent for {{unit}}. Your balance is {{balance_due}}. Please pay through your resident portal as soon as you can — a late fee applies from day " + feeDay + ".\n\nIf you've already paid, thank you — please ignore this message.\n\n{{company_name}}",
            },
          ],
          ["wait", { days: feeDay - 1 }],
          ["branch", { conditions: BALANCE(minBalance), otherwise: "stop" }],
          ["post_charge", { kind: "late_fee", ...fee, memo: "Late fee · {{today}}" }],
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "A late fee was added to your balance",
              body: "Hi {{tenant_first_name}},\n\nRent for {{unit}} is now " + feeDay + " days late, so a late fee was added under your lease. Your balance is {{balance_due}}.\n\n{{company_name}}",
            },
          ],
          ["wait", { days: escalateDay - feeDay }],
          ["branch", { conditions: BALANCE(minBalance), otherwise: "stop" }],
          [
            "create_task",
            {
              title: "Collections: {{tenant_name}} still owes {{balance_due}}",
              note: `Rent is ${escalateDay} days late for {{unit}}. Call the resident, agree a plan, or prepare a notice.`,
              dueInDays: 2,
              escalate: true,
            },
          ],
          ["wait", { days: demandDay - escalateDay }],
          ["branch", { conditions: BALANCE(minBalance), otherwise: "stop" }],
          [
            "send_email",
            {
              recipient: "tenant",
              category: "legal",
              subject: "Demand for payment — {{unit}}",
              body: "Dear {{tenant_name}},\n\nOur records show an unpaid balance of {{balance_due}} for {{unit}}, now " + demandDay + " days past due. Please pay the full balance or contact us to arrange payment immediately. If the balance isn't resolved, we may take further action under your lease.\n\n{{company_name}}",
            },
          ],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, collectionsLadder) }));
  },
};

export default collectionsLadder;
