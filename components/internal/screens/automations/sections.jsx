"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  Ban,
  Bell,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Clock,
  Filter,
  GitBranch,
  History,
  ListTodo,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  UserCheck,
  Wrench,
  Zap,
} from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { Textarea } from "@geiger/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@geiger/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@geiger/ui/dialog";
import { EmptyState, Field, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { usePermission } from "@/context/rbac-context";
import { useModules } from "@/context/modules-context";
import { getModule } from "@/lib/modules";
import { teamMembersLayer } from "@/lib/supabase/team_members";
import { vendorsLayer } from "@/lib/supabase/vendors";
import { listRoleChoices } from "@/lib/supabase/rbac";
import { cancelAutomationRun, listAutomationRuns } from "@/lib/supabase/automation_runs";
import {
  ASSIGN_MODE_OPTIONS,
  BRANCH_OTHERWISE_OPTIONS,
  CHARGE_AMOUNT_OPTIONS,
  CHARGE_KIND_OPTIONS,
  CONDITION_FIELDS,
  CONDITION_OPS,
  MESSAGE_CATEGORY_OPTIONS,
  PALETTE_STEP_TYPES,
  PRIORITY_OPTIONS,
  RECIPIENT_OPTIONS,
  RECORD_TYPES,
  TRIGGERS,
  TRIGGER_GROUPS,
  conditionGroup,
  getStepType,
  getTrigger,
  normalizeTriggerKey,
  stepDefaults,
  stepSummary,
  triggerDefaults,
  triggerRecordType,
  workflowConditions,
} from "@/lib/automations/catalog";
import {
  MergeFieldPicker,
  TemplatePicker,
  insertAtCursor,
  useTemplates,
} from "./messaging_kit";
import { RUN_STATUS_MAP, STEP_LOG_STATUS_MAP, formatDateTime } from "./shared";

// Workflow editor sections for Automations: trigger, conditions, ordered steps,
// and run history. Everything structured lives in metadata (trigger,
// conditionRules, steps) and persists through onCommitMeta (shallow merge).

export const STEP_ICONS = {
  send_email: Mail,
  notify: Bell,
  create_work_order: Wrench,
  update_status: RefreshCw,
  wait: Clock,
  assign: UserCheck,
  post_charge: CircleDollarSign,
  create_task: ListTodo,
  request_approval: ShieldCheck,
  branch: GitBranch,
  month_end_checks: CalendarCheck,
  owner_digest: Send,
};

export const workflowOf = (item) => {
  const m = item?.metadata || {};
  const triggerEvent = normalizeTriggerKey(item?.triggerEvent);
  const trigger = m.trigger && typeof m.trigger === "object" ? m.trigger : {};
  return {
    triggerEvent,
    trigger,
    recordType: triggerRecordType(triggerEvent, trigger),
    conditionRules: Array.isArray(m.conditionRules) ? m.conditionRules : [],
    conditions: workflowConditions(m),
    steps: Array.isArray(m.steps) ? m.steps : [],
  };
};

// One-line, human description of a workflow's trigger and its config.
export const describeTrigger = (wf) => {
  const def = getTrigger(wf.triggerEvent);
  if (!def) return "No trigger";
  const t = { ...triggerDefaults(wf.triggerEvent), ...wf.trigger };
  if (wf.triggerEvent === "lease.ending") return `${def.label} — ${t.daysBefore} days before the end date`;
  if (wf.triggerEvent === "rent.overdue") return `${def.label} — ${t.daysOverdue} days after the due date, balance ≥ $${t.minBalance}`;
  if (wf.triggerEvent === "work_order.overdue") {
    return `${def.label} — unassigned ${t.unassignedHours}h${t.pastDue === "no" ? "" : " or past due"} · ${t.priorities === "all" ? "every priority" : "urgent and high"}`;
  }
  if (wf.triggerEvent === "vendor.compliance_expiring") return `${def.label} — ${t.daysBefore} days before expiry`;
  if (wf.triggerEvent === "manual") return `${def.label} — on ${RECORD_TYPES[t.recordType]?.label.toLowerCase() || "a record"}s`;
  if (wf.triggerEvent === "schedule") {
    const scope = def.config.find((f) => f.key === "scope").options.find((o) => o.value === t.scope)?.label;
    return `${t.frequency === "daily" ? "Daily" : t.frequency === "monthly" ? `Monthly on day ${t.monthDay}` : "Weekly"} · ${scope}`;
  }
  return def.label;
};

// Config controls for a catalog field list ({ key, label, type, options, min, max, showIf }).
function ConfigControls({ fields, values, onChange, idPrefix }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {fields
        .filter((f) => (f.showIf ? f.showIf(values) : true))
        .map((f) => (
          <Field key={f.key} label={f.label} htmlFor={`${idPrefix}-${f.key}`}>
            {f.type === "select" ? (
              <Select value={String(values[f.key] ?? f.default ?? "")} onValueChange={(v) => onChange({ ...values, [f.key]: v })}>
                <SelectTrigger id={`${idPrefix}-${f.key}`} className="w-full bg-surface-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`${idPrefix}-${f.key}`}
                type="number"
                min={f.min}
                max={f.max}
                defaultValue={values[f.key] ?? f.default ?? ""}
                onBlur={(e) => onChange({ ...values, [f.key]: Number(e.target.value) })}
              />
            )}
          </Field>
        ))}
    </div>
  );
}

export function TriggerSection({ item, onCommit, onCommitMeta }) {
  const wf = workflowOf(item);
  const def = getTrigger(wf.triggerEvent);
  const modules = useModules();
  // Triggers in a module switched off in Settings → Modules aren't offered; the current one stays so the workflow reads.
  const offered = (t) => modules.isOn(t.module) || t.key === wf.triggerEvent;
  const offModule = def?.module && !modules.isOn(def.module) ? getModule(def.module) : null;

  const changeTrigger = async (key) => {
    const nextType = triggerRecordType(key, triggerDefaults(key));
    const ok = await onCommit({ triggerEvent: key });
    if (!ok) return;
    await onCommitMeta({
      trigger: triggerDefaults(key),
      ...(nextType !== wf.recordType ? { conditionRules: [] } : {}),
    });
  };

  return (
    <div className="space-y-4">
      <SectionCard title="When" description="The event that starts this workflow.">
        <div className="space-y-4">
          <Field label="Trigger" htmlFor="wf-trigger">
            <Select value={wf.triggerEvent || ""} onValueChange={changeTrigger}>
              <SelectTrigger id="wf-trigger" className="w-full bg-surface-card">
                <SelectValue placeholder="Choose a trigger" />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_GROUPS.filter((g) => TRIGGERS.some((t) => t.group === g && offered(t))).map((g) => (
                  <SelectGroup key={g}>
                    <SelectLabel>{g}</SelectLabel>
                    {TRIGGERS.filter((t) => t.group === g && offered(t)).map((t) => (
                      <SelectItem key={t.key} value={t.key}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {def ? <p className="text-sm text-text-secondary">{def.desc}</p> : null}
          {offModule ? (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              {offModule.label} is off in Settings → Modules, so this trigger doesn&apos;t fire.
            </p>
          ) : null}
          {def?.config?.length ? (
            <ConfigControls
              key={wf.triggerEvent}
              idPrefix="wf-trigger"
              fields={def.config}
              values={{ ...triggerDefaults(wf.triggerEvent), ...wf.trigger }}
              onChange={(next) => onCommitMeta({ trigger: next })}
            />
          ) : null}
        </div>
      </SectionCard>
      <SectionCard title="How it fires" description="Record triggers come from database events; timed triggers are checked by the automation runner.">
        <ul className="space-y-1.5 text-sm text-text-secondary">
          <li>• Each record runs a workflow at most once per trigger event (or once per window for timed triggers).</li>
          <li>• The runner processes new events and waiting steps every time the Automation runner job runs (Scheduled jobs).</li>
          <li>• Records this workflow creates itself never re-trigger it.</li>
        </ul>
      </SectionCard>
    </div>
  );
}

// Top-level rules are editable; nested groups (set by a playbook) are kept as they are.
const flatRules = (group) => group.rules.filter((r) => r && !Array.isArray(r.rules));
const nestedGroups = (group) => group.rules.filter((r) => r && Array.isArray(r.rules));

export function ConditionsSection({ item, onCommitMeta }) {
  const wf = workflowOf(item);
  const fields = CONDITION_FIELDS[wf.recordType] || [];
  const [rules, setRules] = useState(flatRules(wf.conditions));
  const [match, setMatch] = useState(wf.conditions.op);
  const [seed, setSeed] = useState(item.id);
  if (seed !== item.id) {
    setSeed(item.id);
    setRules(flatRules(wf.conditions));
    setMatch(wf.conditions.op);
  }
  const nested = nestedGroups(wf.conditions);

  // conditionRules stays the plain list (v1); conditions carries the match mode and any nested groups (v2).
  const save = (next, op = match) => {
    setRules(next);
    onCommitMeta({ conditionRules: next, conditions: { op, rules: [...next, ...nested] } });
  };
  const patchRule = (i, patch, persist = true) => {
    const next = rules.map((r, j) => (j === i ? { ...r, ...patch } : r));
    if (persist) save(next);
    else setRules(next);
  };

  if (!wf.recordType) {
    return (
      <SectionCard>
        <EmptyState
          icon={Filter}
          title="No record to filter"
          description="This trigger doesn't run against a record. Pick a record trigger, or a schedule that runs for each lease or tenant."
        />
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Only if"
      description={`${match === "or" ? "Any one condition" : "Every condition"} must hold on the ${RECORD_TYPES[wf.recordType].label.toLowerCase()} for the workflow to run.`}
      action={
        <div className="flex items-center gap-2">
        <Select
          value={match}
          onValueChange={(v) => {
            setMatch(v);
            save(rules, v);
          }}
        >
          <SelectTrigger className="h-8 w-36 bg-surface-card text-xs" aria-label="Match">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="and">Match all</SelectItem>
            <SelectItem value="or">Match any</SelectItem>
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="border-border bg-surface-card hover:bg-surface-hover"
          onClick={() => save([...rules, { field: fields[0]?.key || "status", op: "equals", value: "" }])}
        >
          <Plus className="h-3.5 w-3.5" /> Add Condition
        </Button>
        </div>
      }
    >
      {nested.length ? (
        <p className="mb-3 rounded-lg border border-border bg-surface-card px-3 py-2 text-xs text-text-secondary">
          Also checks {nested.length} grouped condition set{nested.length === 1 ? "" : "s"} from its playbook ({nested.map((g) => `${g.op === "or" ? "any" : "all"} of ${g.rules.length}`).join(", ")}).
        </p>
      ) : null}
      {rules.length ? (
        <div className="space-y-3">
          {rules.map((r, i) => {
            const op = CONDITION_OPS.find((o) => o.value === r.op);
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                <Select value={r.field} onValueChange={(v) => patchRule(i, { field: v })}>
                  <SelectTrigger className="w-full bg-surface-card" aria-label="Field">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {fields.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={r.op} onValueChange={(v) => patchRule(i, { op: v })}>
                  <SelectTrigger className="w-full bg-surface-card" aria-label="Operator">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {op?.needsValue !== false ? (
                  <Input
                    value={r.value ?? ""}
                    onChange={(e) => patchRule(i, { value: e.target.value }, false)}
                    onBlur={() => save(rules)}
                    placeholder="Value"
                    aria-label="Value"
                  />
                ) : (
                  <span className="text-sm text-text-tertiary">—</span>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => save(rules.filter((_, j) => j !== i))}
                  aria-label="Remove condition"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-text-tertiary">No conditions — it runs for every matching event.</p>
      )}
    </SectionCard>
  );
}

function useTeamMembers() {
  const [members, setMembers] = useState([]);
  useEffect(() => {
    let alive = true;
    teamMembersLayer.list().then((rows) => {
      if (alive) setMembers((rows ?? []).map((m) => ({ value: m.id, label: m.name || m.email || "Member" })));
    });
    return () => {
      alive = false;
    };
  }, []);
  return members;
}

function useVendorOptions() {
  const [vendors, setVendors] = useState([]);
  useEffect(() => {
    let alive = true;
    vendorsLayer.list().then((rows) => {
      if (alive) setVendors((rows ?? []).map((v) => ({ value: v.id, label: v.specialty ? `${v.name} · ${v.specialty}` : v.name || "Vendor" })));
    });
    return () => {
      alive = false;
    };
  }, []);
  return vendors;
}

function useRoleOptions() {
  const [roles, setRoles] = useState([]);
  useEffect(() => {
    let alive = true;
    listRoleChoices().then((rows) => {
      if (alive) setRoles((rows ?? []).map((r) => ({ value: r.id, label: r.name })));
    });
    return () => {
      alive = false;
    };
  }, []);
  return roles;
}

function SimpleSelect({ value, onChange, options, placeholder, id }) {
  return (
    <Select value={value || ""} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full bg-surface-card">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// Per-type config editor. Text fields edit locally (`onLocal`) and persist on blur (`onSave`).
function StepEditor({ step, idx, templates, members, vendors = [], roles = [], recordType, onLocal, onSave }) {
  const c = step.config || {};
  const id = (k) => `step-${idx}-${k}`;
  const bodyRef = useRef(null);
  const set = (k) => (v) => onSave({ ...c, [k]: v });
  const text = (k) => ({
    value: c[k] ?? "",
    onChange: (e) => onLocal({ ...c, [k]: e.target.value }),
    onBlur: () => onSave(c),
  });

  switch (step.type) {
    case "send_email":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="To" htmlFor={id("to")}>
            <SimpleSelect id={id("to")} value={c.recipient} onChange={set("recipient")} options={RECIPIENT_OPTIONS} />
          </Field>
          <Field label="Channel" htmlFor={id("ch")}>
            <SimpleSelect
              id={id("ch")}
              value={c.channel || "email"}
              onChange={set("channel")}
              options={[
                { value: "email", label: "Email" },
                { value: "sms", label: "SMS (provider not connected)" },
              ]}
            />
          </Field>
          <Field label="Kind" htmlFor={id("kind")} hint="Legal notices can need approval and still reach do-not-contact recipients.">
            <SimpleSelect id={id("kind")} value={c.category || "message"} onChange={set("category")} options={MESSAGE_CATEGORY_OPTIONS} />
          </Field>
          {c.recipient === "custom" ? (
            <Field label="Email address" htmlFor={id("email")} className="sm:col-span-2">
              <Input id={id("email")} type="email" placeholder="someone@example.com" {...text("email")} />
            </Field>
          ) : null}
          <Field label="Template" htmlFor={id("tpl")} className="sm:col-span-2" hint="A template is used when the subject and body below are empty.">
            <TemplatePicker id={id("tpl")} templates={templates} value={c.templateId} onChange={set("templateId")} />
          </Field>
          {c.channel !== "sms" ? (
            <Field label="Subject" htmlFor={id("subject")} className="sm:col-span-2">
              <Input id={id("subject")} placeholder="e.g. Welcome to {{property}}" {...text("subject")} />
            </Field>
          ) : null}
          <div className="space-y-1.5 sm:col-span-2">
            <div className="flex items-center justify-between">
              <label htmlFor={id("body")} className="text-sm font-medium text-muted-foreground">
                Message
              </label>
              <MergeFieldPicker label="Field" onInsert={(t) => onSave({ ...c, body: insertAtCursor(bodyRef.current, c.body, t) })} />
            </div>
            <Textarea id={id("body")} ref={bodyRef} className="min-h-[140px]" placeholder="Hi {{tenant_first_name}}, …" {...text("body")} />
          </div>
        </div>
      );
    case "notify":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Notification" htmlFor={id("msg")} className="sm:col-span-2" hint="Logged on the record's activity timeline. Merge fields work here.">
            <Textarea id={id("msg")} className="min-h-[80px]" placeholder="e.g. {{unit}} needs a move-in inspection" {...text("message")} />
          </Field>
          <Field label="Also email a teammate" htmlFor={id("member")}>
            <SimpleSelect
              id={id("member")}
              value={c.memberId || "none"}
              onChange={(v) => set("memberId")(v === "none" ? "" : v)}
              options={[{ value: "none", label: "Nobody" }, ...members]}
            />
          </Field>
          <Field label="Email team alert recipients" htmlFor={id("team")} hint="Settings → Notifications">
            <div className="flex h-9 items-center">
              <Switch id={id("team")} checked={Boolean(c.emailTeam)} onCheckedChange={set("emailTeam")} />
            </div>
          </Field>
        </div>
      );
    case "create_work_order":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" htmlFor={id("name")} className="sm:col-span-2">
            <Input id={id("name")} placeholder="e.g. Move-in inspection — {{unit}}" {...text("name")} />
          </Field>
          <Field label="Priority" htmlFor={id("prio")}>
            <SimpleSelect id={id("prio")} value={c.priority} onChange={set("priority")} options={PRIORITY_OPTIONS} />
          </Field>
          <Field label="Category" htmlFor={id("cat")}>
            <Input id={id("cat")} placeholder="General" {...text("category")} />
          </Field>
          <Field label="Description" htmlFor={id("desc")} className="sm:col-span-2">
            <Textarea id={id("desc")} className="min-h-[80px]" {...text("description")} />
          </Field>
        </div>
      );
    case "update_status":
      return (
        <Field label="New status" htmlFor={id("status")} hint="Set on the record that triggered the workflow (e.g. Active, Completed, Approved).">
          <Input id={id("status")} {...text("status")} />
        </Field>
      );
    case "assign":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Assign to"
            htmlFor={id("mode")}
            hint={c.mode === "vendor" ? undefined : "Matches the work order category to vendor trades; Preferred first, then rating. Vendors with an expired COI are skipped."}
          >
            <SimpleSelect id={id("mode")} value={c.mode || "best_match"} onChange={set("mode")} options={ASSIGN_MODE_OPTIONS} />
          </Field>
          {c.mode === "vendor" ? (
            <Field label="Vendor" htmlFor={id("vendor")}>
              <SimpleSelect id={id("vendor")} value={c.vendorId} onChange={set("vendorId")} options={vendors} placeholder="Choose a vendor" />
            </Field>
          ) : null}
        </div>
      );
    case "post_charge":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Charge"
            htmlFor={id("kind")}
            hint={c.kind === "late_fee" ? "Late fees share the late-fee job's key, so a month is never charged twice." : undefined}
          >
            <SimpleSelect id={id("kind")} value={c.kind || "late_fee"} onChange={set("kind")} options={CHARGE_KIND_OPTIONS} />
          </Field>
          <Field label="Amount" htmlFor={id("amountType")}>
            <SimpleSelect id={id("amountType")} value={c.amountType || "fixed"} onChange={set("amountType")} options={CHARGE_AMOUNT_OPTIONS} />
          </Field>
          {c.amountType !== "late_fee_policy" ? (
            <Field label="Amount ($)" htmlFor={id("amount")}>
              <Input
                id={id("amount")}
                type="number"
                min={0}
                step="0.01"
                className="w-40"
                value={c.amount ?? ""}
                onChange={(e) => onLocal({ ...c, amount: e.target.value })}
                onBlur={() => onSave({ ...c, amount: Number(c.amount) || 0 })}
              />
            </Field>
          ) : null}
          <Field label="Memo" htmlFor={id("memo")} className="sm:col-span-2" hint="Shown on the ledger. Merge fields work here.">
            <Input id={id("memo")} placeholder="e.g. Late fee · {{unit}}" {...text("memo")} />
          </Field>
        </div>
      );
    case "create_task":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Task" htmlFor={id("title")} className="sm:col-span-2">
            <Input id={id("title")} placeholder="e.g. Call {{tenant_name}} about the balance" {...text("title")} />
          </Field>
          <Field label="Details" htmlFor={id("note")} className="sm:col-span-2">
            <Textarea id={id("note")} className="min-h-[70px]" {...text("note")} />
          </Field>
          <Field label="Due in (days)" htmlFor={id("due")}>
            <Input
              id={id("due")}
              type="number"
              min={0}
              className="w-32"
              value={c.dueInDays ?? 1}
              onChange={(e) => onLocal({ ...c, dueInDays: e.target.value })}
              onBlur={() => onSave({ ...c, dueInDays: Number(c.dueInDays) || 0 })}
            />
          </Field>
          <Field label="Assign to" htmlFor={id("member")}>
            <SimpleSelect
              id={id("member")}
              value={c.memberId || "none"}
              onChange={(v) => set("memberId")(v === "none" ? "" : v)}
              options={[{ value: "none", label: "Unassigned" }, ...members]}
            />
          </Field>
          <Field label="Escalate" htmlFor={id("escalate")} hint="Raise it as an urgent exception instead of a routine task.">
            <div className="flex h-9 items-center">
              <Switch id={id("escalate")} checked={Boolean(c.escalate)} onCheckedChange={set("escalate")} />
            </div>
          </Field>
        </div>
      );
    case "request_approval":
      return (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What needs approving" htmlFor={id("title")} className="sm:col-span-2">
            <Input id={id("title")} placeholder="e.g. Send the renewal offer for {{unit}}" {...text("title")} />
          </Field>
          <Field label="Note for the approver" htmlFor={id("note")} className="sm:col-span-2">
            <Textarea id={id("note")} className="min-h-[70px]" {...text("note")} />
          </Field>
          <Field label="Who approves" htmlFor={id("role")}>
            <SimpleSelect
              id={id("role")}
              value={c.approverRole || "any"}
              onChange={(v) => set("approverRole")(v === "any" ? "" : v)}
              options={[{ value: "any", label: "Anyone who can resolve" }, ...roles]}
            />
          </Field>
        </div>
      );
    case "branch": {
      const group = conditionGroup(c.conditions);
      const fields = CONDITION_FIELDS[recordType] || [];
      const rules = group.rules.filter((r) => r && !Array.isArray(r.rules));
      const setRules = (next, persist = true) => {
        const cfg = { ...c, conditions: { ...group, rules: next } };
        if (persist) onSave(cfg);
        else onLocal(cfg);
      };
      if (!fields.length) return <p className="text-sm text-text-tertiary">This workflow doesn&apos;t run on a record, so there&apos;s nothing to check.</p>;
      return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Continue when
            <div className="w-48">
              <SimpleSelect
                value={group.op}
                onChange={(v) => onSave({ ...c, conditions: { ...group, op: v } })}
                options={[
                  { value: "and", label: "all of these hold" },
                  { value: "or", label: "any of these holds" },
                ]}
              />
            </div>
          </div>
          {rules.map((r, i) => {
            const op = CONDITION_OPS.find((o) => o.value === r.op);
            const patchRule = (patch, persist = true) => setRules(rules.map((x, j) => (j === i ? { ...x, ...patch } : x)), persist);
            return (
              <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-center">
                <SimpleSelect value={r.field} onChange={(v) => patchRule({ field: v })} options={fields.map((f) => ({ value: f.key, label: f.label }))} />
                <SimpleSelect value={r.op} onChange={(v) => patchRule({ op: v })} options={CONDITION_OPS.map((o) => ({ value: o.value, label: o.label }))} />
                {op?.needsValue !== false ? (
                  <Input value={r.value ?? ""} onChange={(e) => patchRule({ value: e.target.value }, false)} onBlur={() => onSave(c)} placeholder="Value" aria-label="Value" />
                ) : (
                  <span className="text-sm text-text-tertiary">—</span>
                )}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                  onClick={() => setRules(rules.filter((_, j) => j !== i))}
                  aria-label="Remove condition"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            className="border-border bg-surface-card hover:bg-surface-hover"
            onClick={() => setRules([...rules, { field: fields[0].key, op: "gt", value: "" }])}
          >
            <Plus className="h-3.5 w-3.5" /> Add Condition
          </Button>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Otherwise" htmlFor={id("otherwise")}>
              <SimpleSelect id={id("otherwise")} value={c.otherwise || "stop"} onChange={set("otherwise")} options={BRANCH_OTHERWISE_OPTIONS} />
            </Field>
            {c.otherwise === "skip" ? (
              <Field label="Steps to skip" htmlFor={id("skip")}>
                <Input
                  id={id("skip")}
                  type="number"
                  min={1}
                  className="w-32"
                  value={c.skip ?? 1}
                  onChange={(e) => onLocal({ ...c, skip: e.target.value })}
                  onBlur={() => onSave({ ...c, skip: Math.max(1, Number(c.skip) || 1) })}
                />
              </Field>
            ) : null}
          </div>
          <p className="text-xs text-text-tertiary">
            Checked against the record as it is when the run reaches this step — a payment made during a wait stops the next reminder.
          </p>
        </div>
      );
    }
    case "month_end_checks":
    case "owner_digest":
      return <p className="text-sm text-text-secondary">{getStepType(step.type)?.desc} Set up by its playbook — change it from Playbooks.</p>;
    case "wait":
      return (
        <Field label="Days to wait" htmlFor={id("days")}>
          <Input
            id={id("days")}
            type="number"
            min={0}
            className="w-32"
            value={c.days ?? 1}
            onChange={(e) => onLocal({ ...c, days: Number(e.target.value) })}
            onBlur={() => onSave(c)}
          />
        </Field>
      );
    default:
      return null;
  }
}

export function StepsSection({ item, onCommitMeta }) {
  const wf = workflowOf(item);
  const [steps, setSteps] = useState(wf.steps);
  const [open, setOpen] = useState(() => new Set(wf.steps[0] ? [wf.steps[0].id] : []));
  const [seed, setSeed] = useState(item.id);
  if (seed !== item.id) {
    setSeed(item.id);
    setSteps(wf.steps);
  }
  const templates = useTemplates();
  const members = useTeamMembers();
  const vendors = useVendorOptions();
  const roles = useRoleOptions();

  const save = (next) => {
    setSteps(next);
    onCommitMeta({ steps: next });
  };
  const local = (i, config) => setSteps((prev) => prev.map((s, j) => (j === i ? { ...s, config } : s)));
  const persistConfig = (i, config) => save(steps.map((s, j) => (j === i ? { ...s, config } : s)));
  const move = (i, d) => {
    const next = [...steps];
    const [s] = next.splice(i, 1);
    next.splice(i + d, 0, s);
    save(next);
  };
  const add = (type) => {
    const step = { id: crypto.randomUUID(), type, config: stepDefaults(type) };
    save([...steps, step]);
    setOpen((o) => new Set([...o, step.id]));
  };
  const toggle = (sid) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(sid)) n.delete(sid);
      else n.add(sid);
      return n;
    });

  const addMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="border-border bg-surface-card hover:bg-surface-hover">
          <Plus className="h-3.5 w-3.5" /> Add Step <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 border-border bg-surface-subtle">
        {PALETTE_STEP_TYPES.map((t) => {
          const Icon = STEP_ICONS[t.key] || Zap;
          return (
            <DropdownMenuItem key={t.key} onClick={() => add(t.key)} className="items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4" />
              <div>
                <p className="text-sm text-foreground">{t.label}</p>
                <p className="text-xs text-text-secondary">{t.desc}</p>
              </div>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <SectionCard title="Then" description="Steps run in order. A Wait pauses the run; the runner resumes it when the time comes." action={addMenu}>
      {steps.length ? (
        <ol className="space-y-3">
          {steps.map((s, i) => {
            const Icon = STEP_ICONS[s.type] || Zap;
            const expanded = open.has(s.id);
            return (
              <li key={s.id || i} className="rounded-lg border border-border bg-surface-card">
                <div className="flex items-center gap-3 px-3 py-2.5">
                  <button type="button" onClick={() => toggle(s.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={expanded}>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border bg-surface-subtle text-[11px] font-semibold text-text-secondary">
                      {i + 1}
                    </span>
                    <Icon className="h-4 w-4 shrink-0 text-text-secondary" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{getStepType(s.type)?.label || s.type}</span>
                      <span className="block truncate text-xs text-text-secondary">{stepSummary(s)}</span>
                    </span>
                    {expanded ? <ChevronDown className="ml-auto h-4 w-4 text-text-tertiary" /> : <ChevronRight className="ml-auto h-4 w-4 text-text-tertiary" />}
                  </button>
                  <div className="flex shrink-0 items-center">
                    <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up" className="text-muted-foreground hover:bg-surface-active">
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon-sm" disabled={i === steps.length - 1} onClick={() => move(i, 1)} aria-label="Move down" className="text-muted-foreground hover:bg-surface-active">
                      <ArrowDown className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => save(steps.filter((_, j) => j !== i))}
                      aria-label="Remove step"
                      className="text-muted-foreground hover:bg-red-500/10 hover:text-red-600 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {expanded ? (
                  <div className="border-t border-border px-4 py-4">
                    <StepEditor
                      step={s}
                      idx={i}
                      templates={templates}
                      members={members}
                      vendors={vendors}
                      roles={roles}
                      recordType={wf.recordType}
                      onLocal={(config) => local(i, config)}
                      onSave={(config) => persistConfig(i, config)}
                    />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <EmptyState icon={Zap} title="No steps yet" description="Add what the workflow should do — send a message, notify the team, open a work order, wait…" action={addMenu} />
      )}
    </SectionCard>
  );
}

// Run history with the per-step log; pending / waiting runs can be cancelled.
export function RunsSection({ item }) {
  // Cancelling a run needs automation.manage in the database (PLAT-01d).
  const canCancel = usePermission("automations.manage");
  const [runs, setRuns] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const id = item.id;

  useEffect(() => {
    let alive = true;
    listAutomationRuns(id).then((rows) => alive && setRuns(rows ?? []));
    return () => {
      alive = false;
    };
  }, [id]);

  const cancel = async (run) => {
    setRuns((prev) => prev.map((r) => (r.id === run.id ? { ...r, status: "cancelled" } : r)));
    const ok = await cancelAutomationRun(run.id);
    if (!ok) {
      setRuns((prev) => prev.map((r) => (r.id === run.id ? run : r)));
      toast.error("Couldn't cancel the run.");
    } else toast.success("Run cancelled.");
  };

  if (runs === null) {
    return (
      <div className="flex justify-center py-12">
        <LogoLoading size={40} aria-label="Loading runs" />
      </div>
    );
  }
  if (!runs.length) {
    return (
      <SectionCard>
        <EmptyState icon={History} title="No runs yet" description="Runs appear here once the trigger fires and the automation runner picks them up." />
      </SectionCard>
    );
  }
  return (
    <SectionCard title="Run history" description={`${runs.length} run${runs.length === 1 ? "" : "s"}`} bodyPadding={false}>
      <div className="divide-y divide-border">
        {runs.map((r) => {
          const steps = Array.isArray(r.steps) ? r.steps : [];
          const log = Array.isArray(r.log) ? r.log : [];
          const isOpen = expanded === r.id;
          return (
            <Fragment key={r.id}>
              <div className="flex items-center gap-3 px-5 py-3">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setExpanded(isOpen ? null : r.id)} aria-expanded={isOpen}>
                  {isOpen ? <ChevronDown className="h-4 w-4 shrink-0 text-text-tertiary" /> : <ChevronRight className="h-4 w-4 shrink-0 text-text-tertiary" />}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{r.recordLabel || (r.recordType ? RECORD_TYPES[r.recordType]?.label : "Scheduled run")}</p>
                    <p className="truncate text-xs text-text-secondary">
                      {formatDateTime(r.startedAt)} · step {Math.min(Number(r.currentStep) || 0, steps.length)} of {steps.length}
                      {r.status === "waiting" && r.resumeAt ? ` · resumes ${formatDateTime(r.resumeAt)}` : ""}
                    </p>
                  </div>
                </button>
                <StatusPill status={r.status} map={RUN_STATUS_MAP} />
                {canCancel && ["pending", "waiting"].includes(r.status) ? (
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-surface-active" onClick={() => cancel(r)}>
                    <Ban className="h-3.5 w-3.5" /> Cancel
                  </Button>
                ) : null}
              </div>
              {isOpen ? (
                <div className="bg-surface-card px-5 py-3">
                  {r.error ? <p className="mb-2 text-xs text-red-600 dark:text-red-400">{r.error}</p> : null}
                  <ol className="space-y-2">
                    {steps.map((s, i) => {
                      const entry = [...log].reverse().find((l) => l.step === i);
                      return (
                        <li key={i} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[10px] text-text-secondary">{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-foreground">{stepSummary(s)}</p>
                            {entry?.message ? <p className="text-xs text-text-secondary">{entry.message}</p> : null}
                          </div>
                          {entry ? <StatusPill status={entry.status} map={STEP_LOG_STATUS_MAP} /> : <Badge variant="outline">Not run</Badge>}
                        </li>
                      );
                    })}
                  </ol>
                </div>
              ) : null}
            </Fragment>
          );
        })}
      </div>
    </SectionCard>
  );
}

// Danger zone (mirrors the geiger-events builder): delete the workflow after a confirm; respects records.delete.
export function DeleteSection({ item, onDelete }) {
  const [open, setOpen] = useState(false);
  const allowed = usePermission("records.delete");
  return (
    <>
      <div className="flex items-center justify-between gap-4 rounded-xl border border-red-500/20 bg-red-500/5 p-5">
        <div>
          <p className="text-sm font-medium text-foreground">Delete this workflow</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Its trigger stops firing straight away. Past runs stay in Run History. This can&apos;t be undone.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!allowed}
          title={allowed ? undefined : "Your role can't delete workflows"}
          className="shrink-0 border-red-500/30 bg-transparent text-red-700 hover:bg-red-500/10 hover:text-red-700 dark:text-red-300 dark:hover:text-red-300"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="h-4 w-4" /> Delete
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete workflow</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete <span className="font-medium text-foreground">{item.name}</span>? This action can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-red-500/90 text-white hover:bg-red-500"
              onClick={() => {
                setOpen(false);
                onDelete?.(item);
              }}
            >
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
