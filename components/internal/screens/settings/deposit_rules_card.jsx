"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";

import { LogoLoading } from "@geiger/ui";
import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm, missingRequired } from "@/components/internal/screens/entity/fields_form";
import { usePermission } from "@/context/rbac-context";
import { jurisdictionRules, listDepositRules } from "@/lib/supabase/jurisdiction_rules";
import { ACCELERATED_RENT_OPTIONS, DAYS_FROM_OPTIONS, EMAIL_ALLOWED_OPTIONS, MAIL_CLASS_OPTIONS, RULE_DISCLAIMER, RULE_KIND, ruleParams } from "@/lib/billing/move_out_math";

// Deposit return rules (CORE-13): an empty, user-maintained table per state (or city) that the Final account checks — warn only.

const PARAM_KEYS = ["returnDays", "daysFrom", "mailRequired", "emailAllowed", "requiresForwardingAddress", "acceleratedRent", "receiptsOver", "retentionYears", "wording", "penaltyNote"];
const GHOST = "text-muted-foreground hover:bg-surface-active hover:text-foreground";

const FIELDS = [
  { key: "jurisdictionCode", label: "State", type: "text", required: true, placeholder: "e.g. WA", hint: "Two-letter state code." },
  { key: "locality", label: "City", type: "text", placeholder: "Statewide", hint: "Only for a city with its own rule." },
  { key: "name", label: "Name", type: "text", full: true, placeholder: "e.g. Washington security deposits" },
  { key: "returnDays", label: "Return the statement within (days)", type: "number", min: 1 },
  { key: "daysFrom", label: "Counted from", type: "select", options: DAYS_FROM_OPTIONS },
  { key: "mailRequired", label: "Mailed copy", type: "select", options: MAIL_CLASS_OPTIONS },
  { key: "emailAllowed", label: "Email as delivery", type: "select", options: EMAIL_ALLOWED_OPTIONS },
  { key: "acceleratedRent", label: "Accelerated rent", type: "select", options: ACCELERATED_RENT_OPTIONS },
  { key: "receiptsOver", label: "Receipts required above", type: "currency", hint: "Blank when not required." },
  { key: "requiresForwardingAddress", label: "The deadline waits for a forwarding address", type: "switch", full: true },
  { key: "wording", label: "Required wording", type: "textarea", full: true, hint: "Printed on the deposit letter as written." },
  { key: "penaltyNote", label: "Penalty note", type: "text", full: true, placeholder: "e.g. Late: lose the right to keep any of the deposit" },
  { key: "retentionYears", label: "Keep records (years)", type: "number", min: 0 },
  { key: "citation", label: "Citation", type: "text", placeholder: "e.g. RCW 59.18.280" },
  { key: "sourceUrl", label: "Official source", type: "text", full: true, placeholder: "https://…" },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "active", label: "Active" },
      { value: "draft", label: "Draft (not checked)" },
      { value: "retired", label: "Retired" },
    ],
  },
  {
    key: "enforcement",
    label: "When it doesn't hold",
    type: "select",
    options: [
      { value: "warn", label: "Warn" },
      { value: "block", label: "Block accelerated rent it doesn't allow" },
    ],
  },
];

const EMPTY = { jurisdictionCode: "", locality: "", name: "", returnDays: "", daysFrom: "move_out", mailRequired: "none", emailAllowed: "unknown", acceleratedRent: "unknown", receiptsOver: "", requiresForwardingAddress: false, wording: "", penaltyNote: "", retentionYears: "", citation: "", sourceUrl: "", status: "active", enforcement: "warn" };

// A rule row → the dialog's flat draft, and back.
const draftOf = (r) => ({ ...EMPTY, ...Object.fromEntries(PARAM_KEYS.map((k) => [k, r.params?.[k] ?? EMPTY[k]])), id: r.id, jurisdictionCode: r.jurisdictionCode, locality: r.locality || "", name: r.name || "", citation: r.citation || "", sourceUrl: r.sourceUrl || "", status: r.status || "active", enforcement: r.enforcement || "warn" });
function rowOf(d) {
  const params = {};
  for (const k of PARAM_KEYS) {
    const v = d[k];
    if (v === "" || v === undefined || v === null || v === false) continue;
    params[k] = ["returnDays", "receiptsOver", "retentionYears"].includes(k) ? Number(v) : v;
  }
  return { kind: RULE_KIND, jurisdictionCode: String(d.jurisdictionCode || "").trim().toUpperCase(), locality: String(d.locality || "").trim(), name: String(d.name || "").trim(), citation: String(d.citation || "").trim(), sourceUrl: String(d.sourceUrl || "").trim(), status: d.status || "active", enforcement: d.enforcement || "warn", params, reviewedAt: new Date().toISOString().slice(0, 10) };
}

function summaryOf(r) {
  const p = ruleParams(r);
  const accel = ACCELERATED_RENT_OPTIONS.find((o) => o.value === p.acceleratedRent && o.value !== "unknown");
  return [
    p.returnDays ? `${p.returnDays} days` : "No deadline set",
    p.mailRequired ? (p.mailClass === "certified" ? "certified mail" : "mailed copy") : "",
    accel ? `accelerated rent: ${accel.label.toLowerCase()}` : "",
    p.receiptsOver ? `receipts above ${p.receiptsOver}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function DepositRulesCard() {
  const [rows, setRows] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const canEdit = usePermission("settings.manage");
  const load = useCallback(() => listDepositRules().then((r) => setRows(r ?? [])), []);
  useEffect(() => {
    load();
  }, [load]);

  const patch = (p) => setDraft((d) => ({ ...d, ...p }));
  const save = async () => {
    const missing = missingRequired(draft, FIELDS, true);
    if (missing.length) return toast.error(`Fill in ${missing.join(", ")}.`);
    if (!/^[A-Z]{2}$/i.test(String(draft.jurisdictionCode).trim())) return toast.error("Use the two-letter state code (e.g. WA).");
    setSaving(true);
    const row = rowOf(draft);
    const ok = draft.id ? await jurisdictionRules.update(draft.id, row) : await jurisdictionRules.create({ id: crypto.randomUUID(), ...row });
    setSaving(false);
    if (!ok) return toast.error("Couldn't save the rule.");
    toast.success("Deposit rule saved.");
    setDraft(null);
    load();
  };
  const remove = async (r) => {
    if (!(await jurisdictionRules.softDelete(r.id))) return toast.error("Couldn't delete the rule.");
    toast.success("Deposit rule deleted.");
    load();
  };

  return (
    <SectionCard
      title="Deposit return rules"
      description="Your own rules per state (or city) for returning security deposits: the deadline, mailing, email delivery, accelerated rent and any required wording. The Final account checks them and warns; it starts empty."
      action={
        <Button size="sm" variant="outline" className="border-border bg-surface-card" disabled={!canEdit} title={canEdit ? undefined : "Your role can't change settings"} onClick={() => setDraft({ ...EMPTY })}>
          <Plus className="h-4 w-4" /> Add Rule
        </Button>
      }
    >
      <div className="space-y-3">
        {!rows ? (
          <div className="flex justify-center py-6">
            <LogoLoading size={36} aria-label="Loading deposit rules" />
          </div>
        ) : rows.length ? (
          <ul className="divide-y divide-border rounded-xl border border-border">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                    {r.name || `${r.jurisdictionCode} deposits`}
                    <Badge variant="outline">{[r.jurisdictionCode, r.locality].filter(Boolean).join(" · ")}</Badge>
                    {r.status !== "active" ? <Badge variant="neutral">{r.status}</Badge> : null}
                    {r.enforcement === "block" ? <Badge variant="warning">Blocks</Badge> : null}
                  </p>
                  <p className="truncate text-xs text-text-secondary">{[summaryOf(r), r.citation].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" size="icon" aria-label="Edit rule" className={GHOST} disabled={!canEdit} onClick={() => setDraft(draftOf(r))}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="Delete rule" className={GHOST} disabled={!canEdit} onClick={() => remove(r)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-text-secondary">No deposit rules yet. Add one per state you operate in — Legal Resources lists the official sources for each state.</p>
        )}
        <p className="text-xs text-text-tertiary">{RULE_DISCLAIMER}</p>
      </div>
      <Dialog open={Boolean(draft)} onOpenChange={(o) => !o && !saving && setDraft(null)}>
        <DialogContent className="gap-0 overflow-hidden bg-background p-0 sm:max-w-2xl">
          <DialogHeader className="space-y-0.5 border-b border-border p-5 text-left">
            <DialogTitle className="text-base">{draft?.id ? "Edit deposit rule" : "Add deposit rule"}</DialogTitle>
            <DialogDescription className="text-xs">{RULE_DISCLAIMER}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto p-5">{draft ? <FieldsForm item={draft} fields={FIELDS} onPatch={patch} onCommit={patch} flat /> : null}</div>
          <DialogFooter className="border-t border-border bg-surface-subtle/40 px-5 py-4">
            <Button variant="ghost" className={GHOST} disabled={saving} onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={saving} onClick={save}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SectionCard>
  );
}

export default DepositRulesCard;
