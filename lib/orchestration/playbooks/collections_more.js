import { PREREQS, autonomyDefaults, autonomyFor, autonomyStep, num, propertyConditions, scopeStep, steps } from "./shared";

// Payment-plan follow-up and autopay failure recovery (Collections).

export const paymentPlanFollowup = {
  key: "payment_plan_followup",
  version: 1,
  area: "Collections",
  title: "Payment-plan follow-up",
  outcome: "Residents on a repayment plan pay each installment on time.",
  description: "Reminds residents before each installment and sends a missed installment to the review queue.",
  // Installments aren't recorded anywhere in Geiger yet, so this stays blocked rather than pretending.
  prerequisites: [PREREQS.paymentPlans, PREREQS.email],
  defaultAutonomy: "approve",
  kpis: ["delinquent_balance"],
  signals: ["rent_delinquency"],
  changes: { 1: ["First version."] },
  defaults: () => autonomyDefaults("approve"),
  questions: () => [autonomyStep("approve")],
  workflows: () => [],
};

export const autopayFailureRecovery = {
  key: "autopay_failure_recovery",
  version: 1,
  area: "Collections",
  title: "Autopay failure recovery",
  outcome: "A declined autopay turns into a payment, not a surprise balance.",
  description: "When autopay fails the resident is asked to pay online straight away, reminded a few days later, and a teammate gets a review item if it's still unresolved.",
  prerequisites: [PREREQS.stripe, PREREQS.email],
  defaultAutonomy: "auto",
  kpis: ["rent_collected", "collection_rate"],
  signals: ["rent_delinquency"],
  changes: { 1: ["First version."] },

  defaults: () => ({ reminderDays: 3, reviewDays: 2, ...autonomyDefaults("auto") }),

  questions: (ctx) => [
    {
      key: "timing",
      title: "Timing",
      fields: [
        { key: "reminderDays", label: "Remind after (days)", type: "number", min: 1, required: true },
        { key: "reviewDays", label: "Then raise a review item after (days)", type: "number", min: 1, required: true },
      ],
    },
    scopeStep(ctx),
    autonomyStep("auto"),
  ],

  workflows(config) {
    const c = { ...autopayFailureRecovery.defaults(), ...config };
    return [
      {
        key: "recover",
        name: "Autopay failure recovery",
        description: "Pay-online notice, a reminder, then a review item.",
        triggerEvent: "autopay.failed",
        trigger: {},
        ...propertyConditions(c),
        steps: steps("recover", [
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "Your automatic rent payment didn't go through",
              body: "Hi {{tenant_first_name}},\n\nYour automatic payment for {{unit}} was declined by your bank or card. Your balance is {{balance_due}}. Please pay online from your resident portal, or update your payment method there so next month's autopay works.\n\n{{company_name}}",
            },
          ],
          ["wait", { days: Math.max(1, num(c.reminderDays, 3)) }],
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "Reminder: your rent payment is still open",
              body: "Hi {{tenant_first_name}},\n\nA quick reminder that your autopay payment for {{unit}} didn't go through. Your balance is {{balance_due}}. If you've paid since, thank you — please ignore this message.\n\n{{company_name}}",
            },
          ],
          ["wait", { days: Math.max(1, num(c.reviewDays, 2)) }],
          [
            "create_task",
            {
              title: "Autopay failed for {{tenant_name}} — check the payment",
              note: "Autopay was declined and the resident has had two messages. Confirm whether they paid and fix the payment method with them.",
              dueInDays: 2,
            },
          ],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, autopayFailureRecovery) }));
  },
};
