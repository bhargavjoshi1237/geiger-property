import { INTAKE_RULE_DEFAULTS } from "@/lib/orchestration/intake_rules";
import { PREREQS, autonomyDefaults, autonomyFor, autonomyStep, memberOptions, num, propertyConditions, scopeStep, steps } from "./shared";

// Maintenance playbooks: intake and routing, the work-order SLA watchdog, and the vendor compliance chase.

const keywordList = (v) =>
  (Array.isArray(v) ? v : String(v || "").split(","))
    .map((k) => String(k).trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 25);

export const maintenanceIntake = {
  key: "maintenance_intake",
  version: 1,
  area: "Maintenance",
  title: "Maintenance intake and routing",
  outcome: "Every request is acknowledged, emergencies page on-call, and work reaches the right vendor.",
  description:
    "New requests from the portal or email: emergency words (or an Urgent priority) page your on-call teammate, the best compliant vendor for the trade is assigned, and the resident gets an acknowledgement.",
  prerequisites: [PREREQS.email, PREREQS.vendors],
  defaultAutonomy: "auto",
  kpis: ["open_work_orders", "work_order_turnaround"],
  signals: ["work_order_attention", "repeat_repairs"],
  changes: { 1: ["First version."] },

  defaults: () => ({ emergencyKeywords: INTAKE_RULE_DEFAULTS.emergencyKeywords.slice(0, 12).join(", "), onCallMemberId: "", assign: true, ...autonomyDefaults("auto") }),

  questions: (ctx) => [
    {
      key: "routing",
      title: "Routing",
      fields: [
        { key: "emergencyKeywords", label: "Emergency words (comma-separated)", type: "textarea", full: true },
        { key: "onCallMemberId", label: "Page this teammate for emergencies", type: "select", options: memberOptions(ctx) },
        { key: "assign", label: "Assign the best compliant vendor for the trade", type: "switch" },
      ],
    },
    scopeStep(ctx),
    autonomyStep("auto"),
  ],

  workflows(config) {
    const c = { ...maintenanceIntake.defaults(), ...config };
    const words = keywordList(c.emergencyKeywords);
    const emergency = {
      op: "or",
      rules: [
        { field: "priority", op: "equals", value: "Urgent" },
        ...words.flatMap((w) => [
          { field: "name", op: "contains", value: w },
          { field: "description", op: "contains", value: w },
        ]),
      ],
    };
    return [
      {
        key: "intake",
        name: "Maintenance intake and routing",
        description: "Emergency page, vendor assignment and resident acknowledgement.",
        triggerEvent: "maintenance_request.created",
        trigger: {},
        ...propertyConditions(c),
        steps: steps("intake", [
          ["branch", { conditions: emergency, otherwise: "skip", skip: 1 }],
          [
            "notify",
            {
              message: "EMERGENCY request at {{unit}}: {{tenant_name}} needs help now — call them and dispatch.",
              memberId: c.onCallMemberId || "",
              emailTeam: true,
            },
          ],
          ...(c.assign !== false ? [["assign", { mode: "best_match" }]] : []),
          [
            "send_email",
            {
              recipient: "tenant",
              subject: "We've got your maintenance request",
              body: "Hi {{tenant_first_name}},\n\nThanks for letting us know. Your request for {{unit}} is logged and we'll confirm a visit time shortly. If water, gas or fire is involved, call our emergency line now.\n\n{{company_name}}",
            },
          ],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, maintenanceIntake) }));
  },
};

export const workOrderSla = {
  key: "work_order_sla",
  version: 1,
  area: "Maintenance",
  title: "Work-order SLA watchdog",
  outcome: "Nothing urgent sits unassigned, and late jobs get chased.",
  description: "Work orders still unassigned after your window, or past their due date, go to the review queue and the assigned vendor gets a nudge.",
  prerequisites: [PREREQS.email],
  defaultAutonomy: "auto",
  kpis: ["overdue_work_orders", "urgent_work_orders"],
  signals: ["work_order_attention"],
  changes: { 1: ["First version."] },

  defaults: () => ({ unassignedHours: 4, priorities: "urgent_high", ...autonomyDefaults("auto") }),

  questions: (ctx) => [
    {
      key: "window",
      title: "Window",
      fields: [
        { key: "unassignedHours", label: "Escalate when unassigned for (hours)", type: "number", min: 1, required: true },
        {
          key: "priorities",
          label: "Watch",
          type: "select",
          options: [
            { value: "urgent_high", label: "Urgent and high priority" },
            { value: "all", label: "Every priority" },
          ],
        },
      ],
    },
    scopeStep(ctx),
    autonomyStep("auto"),
  ],

  workflows(config) {
    const c = { ...workOrderSla.defaults(), ...config };
    return [
      {
        key: "sla",
        name: "Work-order SLA watchdog",
        description: "Escalate overdue or unassigned work orders, then nudge the vendor.",
        triggerEvent: "work_order.overdue",
        trigger: { unassignedHours: Math.max(1, num(c.unassignedHours, 4)), priorities: c.priorities || "urgent_high", pastDue: "yes" },
        ...propertyConditions(c),
        steps: steps("sla", [
          [
            "create_task",
            {
              title: "Overdue work order at {{unit}}",
              note: "This work order is unassigned past the window or past its due date. Assign a vendor or update the due date.",
              dueInDays: 1,
              escalate: true,
            },
          ],
          ["branch", { conditions: { op: "and", rules: [{ field: "vendor_name", op: "is_set" }] }, otherwise: "stop" }],
          [
            "send_email",
            {
              recipient: "vendor",
              subject: "Following up on the job at {{unit}}",
              body: "Hi {{vendor_name}},\n\nWe're following up on the work order at {{unit}}, which is now overdue. Please reply with your visit time or an update today.\n\n{{company_name}}",
            },
          ],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, workOrderSla) }));
  },
};

export const vendorComplianceChase = {
  key: "vendor_compliance_chase",
  version: 1,
  area: "Compliance",
  title: "Vendor compliance chase",
  outcome: "No vendor works for you on an expired insurance certificate.",
  description:
    "An expiring COI or licence asks the vendor for an update and gives a teammate a task to collect it. Vendors with an expired COI are never auto-assigned new work.",
  prerequisites: [PREREQS.email],
  defaultAutonomy: "auto",
  kpis: [],
  signals: ["vendor_compliance"],
  changes: { 1: ["First version."] },

  defaults: () => ({ daysBefore: 30, ...autonomyDefaults("auto") }),

  questions: () => [
    { key: "window", title: "Window", fields: [{ key: "daysBefore", label: "Start chasing this many days before expiry", type: "number", min: 1, required: true }] },
    autonomyStep("auto"),
  ],

  workflows(config) {
    const c = { ...vendorComplianceChase.defaults(), ...config };
    return [
      {
        key: "chase",
        name: "Vendor compliance chase",
        description: "Ask the vendor for an updated document and track it.",
        triggerEvent: "vendor.compliance_expiring",
        trigger: { daysBefore: Math.max(1, num(c.daysBefore, 30)) },
        steps: steps("chase", [
          [
            "send_email",
            {
              recipient: "vendor",
              subject: "Please send your updated insurance or licence",
              body: "Hi {{vendor_name}},\n\nThe insurance certificate or licence we have on file for you is expiring or has expired. Please reply with an updated copy — we can't assign new work without a current certificate.\n\n{{company_name}}",
            },
          ],
          ["create_task", { title: "Collect the updated certificate from {{vendor_name}}", note: "Upload it to the vendor's Compliance section when it arrives.", dueInDays: 7 }],
        ]),
      },
    ].map((w) => ({ ...w, ...autonomyFor(c, vendorComplianceChase) }));
  },
};
