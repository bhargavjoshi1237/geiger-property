import { PREREQS, autonomyDefaults, autonomyFor, autonomyStep, num, propertyConditions, scopeStep, steps } from "./shared";

// Lease playbooks: renewal pipeline, application to move-in, move-out and deposit return, vacancy turn.

// A lease that hasn't renewed, given notice or ended yet.
const NOT_DECIDED = {
  op: "and",
  rules: [
    { field: "status", op: "not_equals", value: "Renewed" },
    { field: "status", op: "not_equals", value: "Notice given" },
    { field: "status", op: "not_equals", value: "Ended" },
    { field: "status", op: "not_equals", value: "Terminated" },
  ],
};

export const renewalPipeline = {
  key: "renewal_pipeline",
  version: 1,
  area: "Leases",
  title: "Renewal pipeline",
  outcome: "Every expiring lease gets a priced offer on time, and silence is followed up.",
  description:
    "120 days out a teammate proposes the new rent (within your maximum increase); 90 days out the offer goes out once approved; nudges at 60 and 45 days if there's no answer.",
  prerequisites: [PREREQS.email, PREREQS.rentCaps],
  defaultAutonomy: "approve",
  kpis: ["renewal_rate"],
  signals: ["renewal_at_risk", "lease_expiring_no_offer", "below_market_rent"],
  changes: { 1: ["First version."] },

  defaults: () => ({ proposeDays: 120, offerDays: 90, firstNudge: 60, secondNudge: 45, maxIncreasePct: 5, ...autonomyDefaults("approve") }),

  questions: (ctx) => [
    {
      key: "timing",
      title: "Timeline",
      description: "Days before the lease ends.",
      fields: [
        { key: "proposeDays", label: "Propose the new rent", type: "number", min: 30, required: true },
        { key: "offerDays", label: "Send the offer", type: "number", min: 15, required: true },
        { key: "firstNudge", label: "First nudge", type: "number", min: 5, required: true },
        { key: "secondNudge", label: "Second nudge", type: "number", min: 1, required: true },
        { key: "maxIncreasePct", label: "Maximum increase", type: "percent", hint: "Checked when the rent is proposed; local cap tables aren't loaded yet." },
      ],
      validate: (v) =>
        !(num(v.proposeDays, 0) > num(v.offerDays, 0) && num(v.offerDays, 0) > num(v.firstNudge, 0) && num(v.firstNudge, 0) > num(v.secondNudge, 0))
          ? "Each stage must come later (fewer days before the end) than the one before."
          : null,
    },
    scopeStep(ctx),
    autonomyStep("approve"),
  ],

  workflows(config) {
    const c = { ...renewalPipeline.defaults(), ...config };
    const scope = propertyConditions(c);
    const cap = num(c.maxIncreasePct, 5);
    const nudge = (key, days, subject) => ({
      key,
      name: `Renewal pipeline · ${days}-day nudge`,
      description: `If the lease hasn't renewed or given notice ${days} days out, nudge the resident.`,
      triggerEvent: "lease.ending",
      trigger: { daysBefore: days },
      ...scope,
      steps: steps(key, [
        ["branch", { conditions: NOT_DECIDED, otherwise: "stop" }],
        [
          "send_email",
          {
            recipient: "tenant",
            subject,
            body: "Hi {{tenant_first_name}},\n\nYour lease for {{unit}} ends on {{lease_end}} ({{days_until_lease_end}} days). We sent your renewal offer earlier — could you let us know whether you plan to renew? Just reply to this email.\n\n{{company_name}}",
          },
        ],
      ]),
    });
    return [
      {
        key: "propose",
        name: "Renewal pipeline · Propose rent",
        description: `${num(c.proposeDays, 120)} days out: a task to price the renewal (max ${cap}% increase).`,
        triggerEvent: "lease.ending",
        trigger: { daysBefore: num(c.proposeDays, 120) },
        ...scope,
        steps: steps("propose", [
          [
            "create_task",
            {
              title: "Propose renewal rent for {{lease_name}}",
              note: `The lease ends {{lease_end}}. Current rent is {{rent}}; keep the increase within ${cap}%. Use Offer renewal on the lease to record the proposal.`,
              dueInDays: 14,
            },
          ],
        ]),
      },
      {
        key: "offer",
        name: "Renewal pipeline · Send offer",
        description: `${num(c.offerDays, 90)} days out: once a teammate approves, the renewal offer goes to the resident.`,
        triggerEvent: "lease.ending",
        trigger: { daysBefore: num(c.offerDays, 90) },
        ...scope,
        steps: steps("offer", [
          ["branch", { conditions: NOT_DECIDED, otherwise: "stop" }],
          ["request_approval", { title: "Send the renewal offer for {{lease_name}}", note: "Check the proposed rent on the lease's renewal before approving." }],
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "Your renewal offer for {{unit}}",
              body: "Hi {{tenant_first_name}},\n\nYour lease for {{unit}} ends on {{lease_end}} and we'd love you to stay. Your renewal offer is ready — reply to this email or contact the office to go through the terms.\n\n{{company_name}}",
            },
          ],
        ]),
      },
      nudge("nudge1", num(c.firstNudge, 60), "Checking in on your renewal"),
      nudge("nudge2", num(c.secondNudge, 45), "Your lease ends soon — will you renew?"),
    ].map((w) => ({ ...w, ...autonomyFor(c, renewalPipeline) }));
  },
};

export const applicationToMoveIn = {
  key: "application_to_move_in",
  version: 1,
  area: "Leases",
  title: "Application to move-in",
  outcome: "Approved applicants move in without anything falling through the cracks.",
  description: "An approved application gets next steps, tasks to draft the lease and collect the deposit, and a welcome email plus inspection once the move-in is scheduled.",
  prerequisites: [PREREQS.email],
  defaultAutonomy: "auto",
  kpis: ["occupancy"],
  signals: ["application_pending", "upcoming_moves"],
  changes: { 1: ["First version."] },

  defaults: () => autonomyDefaults("auto"),
  questions: (ctx) => [scopeStep(ctx), autonomyStep("auto")],

  workflows(config) {
    const c = { ...applicationToMoveIn.defaults(), ...config };
    const scope = propertyConditions(c);
    return [
      {
        key: "approved",
        name: "Application to move-in · Approved",
        description: "Next steps to the applicant, then lease and deposit tasks.",
        triggerEvent: "application.approved",
        trigger: {},
        ...scope,
        steps: steps("approved", [
          [
            "send_email",
            {
              recipient: "applicant",
              subject: "You're approved for {{unit}}",
              body: "Hi {{recipient_name}},\n\nGood news — your application for {{unit}} is approved. Next we'll send your lease to sign and the deposit details, then book your move-in date.\n\n{{company_name}}",
            },
          ],
          ["create_task", { title: "Draft and send the lease for {{unit}}", note: "Create the lease from the approved application and send it for signature.", dueInDays: 1 }],
          ["create_task", { title: "Collect the deposit for {{unit}}", note: "Request the security deposit and confirm it's received before keys are handed over.", dueInDays: 3 }],
        ]),
      },
      {
        key: "welcome",
        name: "Application to move-in · Welcome",
        description: "Welcome email and move-in inspection when the move-in is scheduled.",
        triggerEvent: "move_in.scheduled",
        trigger: {},
        ...scope,
        steps: steps("welcome", [
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "Welcome to {{property}}",
              body: "Hi {{tenant_first_name}},\n\nWe're looking forward to your move into {{unit}}. Rent of {{rent}} is due on {{due_date}}, and your resident portal is ready for payments and maintenance requests.\n\n{{company_name}}",
            },
          ],
          ["create_work_order", { name: "Move-in inspection — {{unit}}", priority: "Medium", category: "Inspection" }],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, applicationToMoveIn) }));
  },
};

export const moveOutDeposit = {
  key: "move_out_deposit",
  version: 1,
  area: "Leases",
  title: "Move-out and deposit return",
  outcome: "Deposits are returned correctly and before the legal deadline.",
  description: "Move-out instructions and an inspection, a deposit-disposition draft due ahead of your return deadline, then an approval before the refund is issued.",
  prerequisites: [PREREQS.email, PREREQS.depositRefunds],
  defaultAutonomy: "approve",
  kpis: ["deposit_returns_due"],
  signals: ["deposit_return_due"],
  changes: { 1: ["First version."] },

  defaults: (ctx) => ({ draftDays: Math.max(1, num(ctx?.policies?.depositReturnDays, 30) - 7), ...autonomyDefaults("approve") }),

  questions: (ctx) => [
    {
      key: "deadline",
      title: "Deadline",
      fields: [{ key: "draftDays", label: "Draft the disposition within (days of scheduling)", type: "number", min: 1, required: true, hint: "Keep it well inside your state's return deadline (Fees & Policies → deposit return days)." }],
    },
    scopeStep(ctx),
    autonomyStep("approve"),
  ],

  workflows(config) {
    const c = { ...moveOutDeposit.defaults({}), ...config };
    return [
      {
        key: "moveout",
        name: "Move-out and deposit return",
        description: "Instructions, inspection, disposition draft, approval, refund task.",
        triggerEvent: "move_out.scheduled",
        trigger: {},
        ...propertyConditions(c),
        steps: steps("moveout", [
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "Your move-out from {{unit}}",
              body: "Hi {{tenant_first_name}},\n\nWe've scheduled your move-out from {{unit}}. Please leave the unit clean, return all keys, and send us a forwarding address so we can return your deposit.\n\n{{company_name}}",
            },
          ],
          ["create_work_order", { name: "Move-out inspection — {{unit}}", priority: "High", category: "Inspection" }],
          ["create_task", { title: "Draft the deposit disposition for {{tenant_name}}", note: "Itemize deductions from the move-out inspection on the security deposit.", dueInDays: Math.max(1, num(c.draftDays, 23)) }],
          ["request_approval", { title: "Approve the deposit disposition for {{tenant_name}}", note: "Check the itemized deductions before the refund goes out." }],
          ["create_task", { title: "Issue the deposit refund for {{tenant_name}}", note: "Record the refund on the security deposit and send the itemized statement.", dueInDays: 2 }],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, moveOutDeposit) }));
  },
};

export const vacancyTurn = {
  key: "vacancy_turn",
  version: 1,
  area: "Leases",
  title: "Vacancy turn",
  outcome: "Units are rent-ready and listed fast after a move-out.",
  description: "A scheduled move-out opens make-ready work orders (clean, paint and repairs, inspection) and a task to publish the listing once they're done.",
  prerequisites: [PREREQS.listings],
  defaultAutonomy: "auto",
  kpis: ["turn_time", "days_vacant", "vacancy_loss"],
  signals: ["turn_overdue", "vacant_too_long"],
  changes: { 1: ["First version."] },

  defaults: () => ({ listingDays: 10, ...autonomyDefaults("auto") }),

  questions: (ctx) => [
    { key: "listing", title: "Listing", fields: [{ key: "listingDays", label: "Publish the listing within (days)", type: "number", min: 1, required: true }] },
    scopeStep(ctx),
    autonomyStep("auto"),
  ],

  workflows(config) {
    const c = { ...vacancyTurn.defaults(), ...config };
    return [
      {
        key: "turn",
        name: "Vacancy turn · Make-ready",
        description: "Make-ready work orders and a listing task.",
        triggerEvent: "move_out.scheduled",
        trigger: {},
        ...propertyConditions(c),
        steps: steps("turn", [
          ["create_work_order", { name: "Make-ready: cleaning — {{unit}}", priority: "Medium", category: "Cleaning" }],
          ["create_work_order", { name: "Make-ready: paint and repairs — {{unit}}", priority: "Medium", category: "General" }],
          ["create_work_order", { name: "Make-ready inspection — {{unit}}", priority: "Medium", category: "Inspection" }],
          ["create_task", { title: "Publish the listing for {{unit}}", note: "Publish once the make-ready work orders are completed.", dueInDays: Math.max(1, num(c.listingDays, 10)) }],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, vacancyTurn) }));
  },
};
