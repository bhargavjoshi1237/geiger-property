"use client";

import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Workflow,
  Zap,
  Filter,
  Clock,
  TriangleAlert,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { automationsData } from "@/lib/supabase/automations";
import { messageTemplatesLayer } from "@/lib/supabase/message_templates";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import {
  FieldsForm,
  makeFieldsSection,
  makeMetaListSection,
  makeNotesSection,
  makeOverviewSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  ACTIONS,
  AUTOMATION_STATUS_MAP,
  PRIORITY_OPTIONS,
  TRIGGERS,
  filterOptions,
  formatDate,
  listOptions,
  selectOptions,
} from "./shared";

// Automations — stored trigger → action rules (owns `property.automations`).
// Rules are saved only; there is no runner executing them yet.

const TRIGGER_OPTIONS = listOptions(TRIGGERS);
const ACTION_OPTIONS = listOptions(ACTIONS);

const RUNNER_NOTE =
  "Rules are saved, but the automation runner isn't connected yet — nothing runs automatically.";

const ConditionsList = makeMetaListSection({
  field: "conditions",
  singular: "condition",
  icon: Filter,
  primaryPlaceholder: "e.g. Balance is over $100",
});

// Action-specific settings, stored in the rule's metadata bag.
function actionFields(actionType, { templates, members }) {
  switch (actionType) {
    case "Create task/work order":
      return [
        { key: "taskTitle", label: "Task title", type: "text", meta: true, full: true, placeholder: "e.g. Follow up on overdue rent" },
        { key: "taskPriority", label: "Priority", type: "select", meta: true, options: PRIORITY_OPTIONS },
      ];
    case "Apply late fee":
      return [
        { key: "feeAmount", label: "Fee amount ($)", type: "number", meta: true, hint: "Leave blank to use Fees & Policies." },
      ];
    case "Send message (template)":
      return [
        {
          key: "templateId",
          label: "Message template",
          type: "select",
          meta: true,
          full: true,
          options: templates,
          placeholder: templates.length ? "Select a template" : "No templates yet",
        },
      ];
    case "Notify team member":
      return [
        {
          key: "notifyMemberId",
          label: "Team member",
          type: "select",
          meta: true,
          options: members,
          placeholder: members.length ? "Select a member" : "No team members yet",
        },
      ];
    case "Change status":
      return [
        { key: "newStatus", label: "New status", type: "text", meta: true, placeholder: "e.g. Late" },
      ];
    default:
      return [];
  }
}

// Rule editor: trigger, action + its settings, and conditions.
function RuleSection({ item, onPatch, onCommit }) {
  const [options, setOptions] = useState({ templates: [], members: [] });

  useEffect(() => {
    let alive = true;
    Promise.all([messageTemplatesLayer.list(), teamMembersLayer.list()]).then(([t, m]) => {
      if (!alive) return;
      setOptions({
        templates: (t ?? []).map((x) => ({ value: x.id, label: x.name || "Untitled template" })),
        members: (m ?? []).map((x) => ({ value: x.id, label: x.name || x.email || "Member" })),
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  const details = actionFields(item.actionType, options);

  return (
    <div className="space-y-4">
      <SectionCard className="border-amber-500/20 bg-amber-500/10" contentClassName="px-4 py-3">
        <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          {RUNNER_NOTE}
        </p>
      </SectionCard>

      <SectionCard title="When" description="The event that starts this rule.">
        <FieldsForm
          item={item}
          onPatch={onPatch}
          onCommit={onCommit}
          fields={[
            { key: "triggerEvent", label: "Trigger", type: "select", options: TRIGGER_OPTIONS },
            { key: "enabled", label: "Enabled", type: "switch" },
          ]}
        />
      </SectionCard>

      <SectionCard title="Only if" description="Every condition must hold for the rule to act.">
        <ConditionsList item={item} onCommit={onCommit} />
      </SectionCard>

      <SectionCard title="Then" description="What the rule does.">
        <FieldsForm
          item={item}
          onPatch={onPatch}
          onCommit={onCommit}
          fields={[
            { key: "actionType", label: "Action", type: "select", options: ACTION_OPTIONS, full: true },
            ...details,
          ]}
        />
      </SectionCard>
    </div>
  );
}

const automationsConfig = {
  key: "automation",
  singular: "Rule",
  plural: "Rules",
  title: "Automations",
  description:
    "Trigger → action rules for rent, leases, maintenance, and applications. Rules are saved here; the runner isn't connected yet.",
  icon: Workflow,
  titleField: "name",
  searchFields: ["name", "triggerEvent", "actionType"],
  data: automationsData,

  statusMap: AUTOMATION_STATUS_MAP,
  statusFilterOptions: filterOptions(AUTOMATION_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "enabled", label: "Enabled", filter: (r) => r.enabled },
    { value: "disabled", label: "Disabled", filter: (r) => !r.enabled },
  ],

  columns: [
    {
      key: "name",
      header: "Rule",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {r.triggerEvent || "No trigger"} → {r.actionType || "No action"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={AUTOMATION_STATUS_MAP} />,
    },
    {
      key: "enabled",
      header: "Enabled",
      render: (r) =>
        r.enabled ? <Badge variant="success">On</Badge> : <Badge variant="outline">Off</Badge>,
    },
    {
      key: "conditions",
      header: "Conditions",
      align: "right",
      className: "text-right text-sm tabular-nums text-muted-foreground",
      render: (r) => (Array.isArray(r.metadata?.conditions) ? r.metadata.conditions.length : 0),
    },
  ],

  stats: (rows) => {
    const count = (s) => rows.filter((r) => r.status === s).length;
    const enabled = rows.filter((r) => r.enabled).length;
    return [
      { label: "Rules", value: String(rows.length), footer: `${count("Draft")} drafts` },
      { label: "Active", value: String(count("Active")), footer: "Marked active" },
      { label: "Enabled", value: String(enabled), footer: "Switched on" },
      { label: "Paused", value: String(count("Paused")), footer: "Temporarily off" },
    ];
  },

  createDraft: { name: "", triggerEvent: TRIGGERS[0], actionType: ACTIONS[0] },
  createFields: [
    { key: "name", label: "Rule name", type: "text", placeholder: "e.g. Late fee after grace period" },
    { key: "triggerEvent", label: "When", type: "select", options: TRIGGER_OPTIONS },
    { key: "actionType", label: "Then", type: "select", options: ACTION_OPTIONS },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    triggerEvent: draft.triggerEvent || TRIGGERS[0],
    actionType: draft.actionType || ACTIONS[0],
    enabled: false,
    status: "Draft",
  }),

  headerMeta: (r) => [r.triggerEvent, r.actionType].filter(Boolean).join(" → "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this rule." },
      ],
    },
    {
      group: "Rule",
      items: [
        { key: "rule", label: "Rule", icon: Zap, desc: "Trigger, conditions, and action." },
        { key: "settings", label: "Settings", icon: Workflow, desc: "Name and status." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Internal notes and history." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "triggerEvent", label: "When" },
        { key: "actionType", label: "Then" },
        { key: "enabled", label: "Enabled", format: (v) => (v ? "On" : "Off") },
        { key: "status", label: "Status" },
        {
          key: "conditions",
          label: "Conditions",
          meta: true,
          format: (v) => (Array.isArray(v) && v.length ? v.map((c) => c.label).join(" · ") : "None"),
        },
        { key: "createdAt", label: "Created", format: (v) => formatDate(v) },
      ],
      note: RUNNER_NOTE,
    }),
    rule: RuleSection,
    settings: makeFieldsSection([
      { key: "name", label: "Rule name", type: "text", full: true },
      { key: "status", label: "Status", type: "select", options: selectOptions(AUTOMATION_STATUS_MAP) },
      { key: "enabled", label: "Enabled", type: "switch" },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log an internal note…" }),
  },
};

export function AutomationsScreen() {
  return <EntityListScreen config={automationsConfig} />;
}

export default AutomationsScreen;
