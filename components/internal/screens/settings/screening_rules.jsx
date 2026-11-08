"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowUpRight, Building2, ChevronDown, ChevronRight, Copy, Loader2, Pencil, Plus, Scale, SearchX, Trash2 } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { SegmentedTabs } from "@/components/internal/shared/segmented_tabs";
import { EmptyState, Field, ListLoading, ScreenHeader, SearchInput } from "@/components/internal/shared/screen_kit";
import { GroupHeading, LegalFootnote, OUTLINE_BUTTON, TabLabel } from "@/components/internal/screens/legal/parts";
import { RULES_CAVEAT, VerificationBadge } from "@/components/internal/screens/marketing/sections/rules_sections";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { listProperties } from "@/lib/supabase/properties";
import { createScreeningRule, listScreeningRules, softDeleteScreeningRule, updateScreeningRule } from "@/lib/supabase/screening_rules";
import { jurisdictionLabel, resolveJurisdiction, ruleInForce, todayISO, withShadowing } from "@/lib/screening/jurisdictions";
import {
  EFFECT_FIELDS,
  RULE_SCOPES,
  RULE_STATUSES,
  RULE_TOPICS,
  RULE_VERIFICATION,
  SCOPE_LABELS,
  STATUS_MAP,
  TOPIC_LABELS,
  VERIFICATION_MAP,
  effectEntries,
  formatEffect,
  ruleProblems,
  validateEffects,
} from "@/lib/screening/rules_schema";

// Settings → Screening Rules (RISK-05): the shared catalog of location-specific screening rules (property.screening_rules,
// project_id null, shipped as a seed) grouped by jurisdiction like Legal Resources, plus the company's own rules from counsel.

const CRITERIA_KEY = "property.screening.criteria";
const VIEWS = [
  { value: "all", label: "All" },
  { value: "force", label: "In Force" },
  { value: "inactive", label: "Not in Force" },
  { value: "own", label: "Your Rules" },
];
const TOPIC_OPTIONS = [{ value: "all", label: "Every topic" }, ...RULE_TOPICS.map((t) => ({ value: t, label: TOPIC_LABELS[t] }))];
const opts = (list, labels) => list.map((v) => ({ value: v, label: labels?.[v]?.label || labels?.[v] || v }));

const EMPTY_RULE = {
  jurisdictionCode: "",
  scope: "state",
  locality: "",
  ruleKey: "",
  title: "",
  topic: "criminal",
  status: "active",
  enforcement: "warn",
  effectiveFrom: "",
  effectiveTo: "",
  citation: "",
  sourceUrl: "",
  verification: "checked",
  verifiedOn: "",
  notes: "",
  effectsText: "{}",
};

const scopeOfCode = (code) => (code === "US" ? "federal" : code.split("-").length === 2 ? "state" : null);
const stateOf = (code) => code.split("-")[1] || "";

// Short text of what a rule does: its first effects, as "Label: value".
const effectSummary = (effects) =>
  effectEntries(effects)
    .slice(0, 3)
    .map((e) => `${EFFECT_FIELDS.find((f) => f.path === e.path)?.label}: ${formatEffect(e.path, e.value)}`)
    .join(" · ");

function SelectField({ label, value, onChange, options, hint }) {
  return (
    <Field label={label} hint={hint}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="bg-surface-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

// Create or edit one of the company's rules; effects are JSON in the documented shape (lib/screening/rules_schema.js).
function RuleDialog({ draft, onOpenChange, onSave }) {
  const [rule, setRule] = useState(draft || EMPTY_RULE);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setRule((r) => ({ ...r, [key]: value }));
  const text = (key) => (e) => set(key)(e.target.value);

  const save = async () => {
    let parsed;
    try {
      parsed = JSON.parse(rule.effectsText || "{}");
    } catch {
      toast.error("Effects must be valid JSON.");
      return;
    }
    const { effects, problems: effectProblems } = validateEffects(parsed);
    const problems = [...ruleProblems(rule), ...effectProblems];
    if (problems.length) {
      toast.error(problems[0]);
      return;
    }
    setBusy(true);
    const { effectsText: _ignored, ...rest } = rule;
    const ok = await onSave({ ...rest, jurisdictionCode: rule.jurisdictionCode.trim().toUpperCase(), ruleKey: rule.ruleKey.trim(), effects });
    setBusy(false);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={Boolean(draft)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{draft?.id ? "Edit Rule" : draft?.overrides ? "Replace a Shared Rule" : "Add a Rule"}</DialogTitle>
          <DialogDescription>
            A rule your counsel maintains for this company. One with the same jurisdiction and key as a shared rule replaces it for
            your properties. A rule in force needs its source link and the date it was verified.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Jurisdiction code" hint="US, US-CA, US-IL-COOK, US-NY-NYC">
            <Input value={rule.jurisdictionCode} onChange={text("jurisdictionCode")} placeholder="US-CA-OAKLAND" className="font-mono" disabled={Boolean(draft?.overrides)} />
          </Field>
          <Field label="Rule key" hint="Unique within the jurisdiction">
            <Input value={rule.ruleKey} onChange={text("ruleKey")} placeholder="fair_chance_housing" className="font-mono" disabled={Boolean(draft?.overrides)} />
          </Field>
          <Field label="Title" className="sm:col-span-2">
            <Input value={rule.title} onChange={text("title")} />
          </Field>
          <SelectField label="Scope" value={rule.scope} onChange={set("scope")} options={opts(RULE_SCOPES, SCOPE_LABELS)} />
          <Field label="Locality" hint="City or county name, for local rules">
            <Input value={rule.locality} onChange={text("locality")} />
          </Field>
          <SelectField label="Topic" value={rule.topic} onChange={set("topic")} options={opts(RULE_TOPICS, TOPIC_LABELS)} />
          <SelectField label="Status" value={rule.status} onChange={set("status")} options={opts(RULE_STATUSES, STATUS_MAP)} />
          <Field label="In force from">
            <Input type="date" value={rule.effectiveFrom} onChange={text("effectiveFrom")} />
          </Field>
          <Field label="In force until">
            <Input type="date" value={rule.effectiveTo} onChange={text("effectiveTo")} />
          </Field>
          <Field label="Citation" className="sm:col-span-2">
            <Input value={rule.citation} onChange={text("citation")} placeholder="Oakland Mun. Code ch. 8.25" />
          </Field>
          <Field label="Source link" className="sm:col-span-2">
            <Input value={rule.sourceUrl} onChange={text("sourceUrl")} placeholder="https://" />
          </Field>
          <SelectField label="Verification" value={rule.verification} onChange={set("verification")} options={opts(RULE_VERIFICATION, VERIFICATION_MAP)} />
          <Field label="Verified on">
            <Input type="date" value={rule.verifiedOn} onChange={text("verifiedOn")} />
          </Field>
          <SelectField
            label="Enforcement"
            value={rule.enforcement}
            onChange={set("enforcement")}
            options={[{ value: "warn", label: "Warn" }, { value: "block", label: "Block" }]}
            hint="Warn shows the rule and adjusts forms; block lets later steps refuse."
          />
          <Field label="Effects (JSON)" className="sm:col-span-2" hint={`Fields: ${EFFECT_FIELDS.map((f) => f.path).join(", ")}`}>
            <Textarea value={rule.effectsText} onChange={text("effectsText")} rows={6} className="font-mono text-xs" placeholder='{ "criminal": { "allowed": false } }' />
          </Field>
          <Field label="Notes" className="sm:col-span-2">
            <Textarea value={rule.notes} onChange={text("notes")} rows={3} placeholder="Scope limits, exemptions, open questions…" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={save}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Rule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// One rule: title, citation and what it does; opens to its effects, dates and notes.
function RuleRow({ rule, asOf, canEdit, canDelete, onEdit, onOverride, onDelete }) {
  const [open, setOpen] = useState(false);
  const inForce = !rule.shadowedBy && ruleInForce(rule, asOf);
  const status = rule.shadowedBy ? { label: "Replaced", variant: "info" } : rule.status === "active" && !inForce ? { label: "Not in force yet", variant: "info" } : STATUS_MAP[rule.status];
  const entries = effectEntries(rule.effects);
  return (
    <div className="border-t border-border">
      <div className="flex items-start gap-3 py-3 pl-4 pr-3 transition-colors hover:bg-surface-hover sm:pl-5">
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-start gap-2 text-left outline-none" aria-expanded={open}>
          {open ? <ChevronDown className="mt-0.5 size-4 shrink-0 text-text-tertiary" /> : <ChevronRight className="mt-0.5 size-4 shrink-0 text-text-tertiary" />}
          <div className="min-w-0">
            <p className="text-sm font-medium leading-snug text-foreground">{rule.title}</p>
            <p className="mt-0.5 truncate text-xs text-text-secondary">
              {rule.citation ? <span className="font-mono text-[11.5px] text-muted-foreground">{rule.citation}</span> : null}
              {rule.citation && entries.length ? " · " : null}
              {effectSummary(rule.effects) || (entries.length ? "" : "For reference; changes no setting")}
            </p>
          </div>
        </button>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          <Badge variant="neutral" className="hidden sm:inline-flex">{TOPIC_LABELS[rule.topic] || rule.topic}</Badge>
          {rule.custom ? <Badge variant="info">Your rule</Badge> : null}
          <Badge variant={status?.variant || "neutral"}>{status?.label || rule.status}</Badge>
          <VerificationBadge verification={rule.verification} verifiedOn={rule.verifiedOn} />
          {rule.sourceUrl ? (
            <a href={rule.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label="Open the source" className="inline-flex rounded-md p-1 text-text-tertiary hover:bg-surface-active hover:text-foreground">
              <ArrowUpRight className="size-4" />
            </a>
          ) : null}
          {canEdit && rule.custom ? (
            <Button variant="ghost" size="icon-sm" aria-label="Edit rule" className="text-text-secondary hover:text-foreground" onClick={() => onEdit(rule)}>
              <Pencil className="h-4 w-4" />
            </Button>
          ) : null}
          {canDelete && rule.custom ? (
            <Button variant="ghost" size="icon-sm" aria-label="Delete rule" className="text-red-600 hover:bg-red-500/10 dark:text-red-400" onClick={() => onDelete(rule)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          ) : null}
          {canEdit && !rule.custom && !rule.shadowedBy ? (
            <Button variant="ghost" size="icon-sm" aria-label="Replace with your own rule" title="Replace with your own rule" className="text-text-secondary hover:text-foreground" onClick={() => onOverride(rule)}>
              <Copy className="h-4 w-4" />
            </Button>
          ) : null}
        </div>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-dashed border-border bg-surface-card/40 px-5 py-4 sm:pl-11">
          {entries.length ? (
            <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {entries.map((e) => (
                <div key={e.path} className="min-w-0">
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{EFFECT_FIELDS.find((f) => f.path === e.path)?.label}</dt>
                  <dd className="mt-0.5 text-sm text-foreground">{formatEffect(e.path, e.value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-sm text-text-secondary">For reference only: this rule sets no screening value.</p>
          )}
          <p className="text-xs text-text-secondary">
            {[
              rule.effectiveFrom ? `In force from ${rule.effectiveFrom}` : null,
              rule.effectiveTo ? `until ${rule.effectiveTo}` : null,
              rule.verifiedOn ? `Last checked ${rule.verifiedOn}` : null,
              rule.enforcement === "block" ? "Enforcement: block" : "Enforcement: warn",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {rule.notes ? <p className="whitespace-pre-wrap text-sm text-text-secondary">{rule.notes}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

export function ScreeningRulesScreen() {
  const [rules, setRules] = useState([]);
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("all");
  const [topic, setTopic] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const canEdit = usePermission(CRITERIA_KEY);
  const canDeleteRecords = usePermission("property.record.delete");
  const { openItemInTab } = useWorkspaceUrl();
  const asOf = todayISO();

  useEffect(() => {
    let alive = true;
    Promise.all([listScreeningRules(), listProperties()]).then(([rows, props]) => {
      if (!alive) return;
      if (rows === null) toast.error("Couldn't load the screening rules.");
      setRules(rows ?? []);
      setProperties(props ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const all = useMemo(() => withShadowing(rules), [rules]);

  // Each property with its jurisdiction and how many rules are in force there.
  const places = useMemo(
    () =>
      properties
        .filter((p) => p.status !== "Archived")
        .map((p) => {
          const j = resolveJurisdiction(p);
          const count = all.filter((r) => j.codes.includes(r.jurisdictionCode) && !r.shadowedBy && ruleInForce(r, asOf)).length;
          return { property: p, jurisdiction: j, count };
        })
        .sort((a, b) => a.property.name.localeCompare(b.property.name)),
    [properties, all, asOf],
  );

  const counts = useMemo(
    () => ({
      all: all.length,
      force: all.filter((r) => !r.shadowedBy && ruleInForce(r, asOf)).length,
      inactive: all.filter((r) => r.shadowedBy || !ruleInForce(r, asOf)).length,
      own: all.filter((r) => r.custom).length,
    }),
    [all, asOf],
  );

  // Rules matching the filters, grouped by jurisdiction: federal, then each state followed by its local rules.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const match = (r) =>
      (view === "all" || (view === "force" ? !r.shadowedBy && ruleInForce(r, asOf) : view === "inactive" ? r.shadowedBy || !ruleInForce(r, asOf) : r.custom)) &&
      (topic === "all" || r.topic === topic) &&
      (!q || `${r.title} ${r.citation} ${r.locality} ${r.jurisdictionCode} ${r.notes}`.toLowerCase().includes(q));
    const by = new Map();
    for (const r of all.filter(match)) {
      if (!by.has(r.jurisdictionCode)) by.set(r.jurisdictionCode, []);
      by.get(r.jurisdictionCode).push(r);
    }
    const order = (code) => (code === "US" ? "" : `${jurisdictionLabel(`US-${stateOf(code)}`)}|${scopeOfCode(code) ? "" : code}`);
    return [...by.entries()]
      .sort((a, b) => order(a[0]).localeCompare(order(b[0])))
      .map(([code, list]) => {
        const scope = scopeOfCode(code) || list[0].scope;
        return { code, label: jurisdictionLabel(code, scope), scope, rows: list.sort((a, b) => a.title.localeCompare(b.title)) };
      });
  }, [all, view, topic, search, asOf]);

  const save = async (input) => {
    if (editing?.id) {
      const updated = await updateScreeningRule(editing.id, input);
      if (!updated) {
        toast.error("Couldn't save the rule. Your role may not be able to change screening rules.");
        return false;
      }
      setRules((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      toast.success("Rule saved.");
      return true;
    }
    const created = await createScreeningRule({ ...input, id: crypto.randomUUID() });
    if (!created) {
      toast.error("Couldn't add the rule. Check the key isn't already used for this jurisdiction.");
      return false;
    }
    setRules((prev) => [...prev, created]);
    toast.success(input.overrides ? "Your rule now replaces the shared one." : "Rule added.");
    return true;
  };

  const remove = async (rule) => {
    setRules((prev) => prev.filter((r) => r.id !== rule.id));
    if (await softDeleteScreeningRule(rule.id)) toast.success("Rule removed.");
    else {
      setRules((prev) => [...prev, rule]);
      toast.error("Couldn't remove the rule.");
    }
  };

  const draftOf = (r, extra = {}) => ({ ...EMPTY_RULE, ...r, effectsText: JSON.stringify(r.effects || {}, null, 2), ...extra });
  const viewTabs = VIEWS.map((v) => ({ value: v.value, label: <TabLabel text={v.label} count={counts[v.value]} /> }));

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Screening Rules"
        description="Location-specific tenant-screening rules: federal, state, county and city, each linked to its official source. Properties apply the rules for where they sit; add your own from counsel."
        actions={
          canEdit ? (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setEditing({ ...EMPTY_RULE })}>
              <Plus className="h-4 w-4" /> Add Rule
            </Button>
          ) : null
        }
      />
      {loading ? (
        <ListLoading label="Loading screening rules" />
      ) : (
        <>
          {places.length ? (
            <section className="space-y-3">
              <div className="flex items-baseline justify-between gap-4">
                <h2 className="text-base font-semibold text-foreground">Where You Operate</h2>
                <span className="text-xs text-text-secondary">Rules in force at each property</span>
              </div>
              <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
                <div className="-mt-px">
                  {places.map(({ property, jurisdiction, count }) => (
                    <button
                      key={property.id}
                      type="button"
                      onClick={() => openItemInTab(property.id, "Properties", "screeningPolicy")}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto_16px] items-center gap-4 border-t border-border px-5 py-3 text-left outline-none transition-colors hover:bg-surface-hover focus-visible:bg-surface-hover"
                    >
                      <div className="min-w-0">
                        <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <Building2 className="size-3.5 text-text-tertiary" />
                          <span className="truncate">{property.name}</span>
                        </p>
                        <p className="mt-0.5 truncate text-xs text-text-secondary">
                          {jurisdiction.codes.map((c, i) => jurisdictionLabel(c, i === 2 && jurisdiction.county ? "county" : undefined)).join(" · ")}
                          {jurisdiction.countyInferred ? <span className="text-text-tertiary"> · county inferred</span> : null}
                        </p>
                      </div>
                      <span className="text-[13px] tabular-nums text-muted-foreground">
                        {count} {count === 1 ? "rule" : "rules"} in force
                      </span>
                      <ChevronRight className="size-4 text-text-tertiary" />
                    </button>
                  ))}
                </div>
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <h2 className="text-base font-semibold text-foreground">All Rules</h2>
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedTabs tabs={viewTabs} value={view} onChange={setView} buttonClassName="px-2.5" />
              <Select value={topic} onValueChange={setTopic}>
                <SelectTrigger className="h-9 w-44 bg-surface-card" aria-label="Topic">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TOPIC_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <SearchInput value={search} onChange={setSearch} placeholder="Search rules" className="w-full sm:ml-auto sm:w-56" />
            </div>
            {groups.length ? (
              <div className="space-y-5">
                {groups.map((g) => (
                  <div key={g.code} className="space-y-2">
                    <GroupHeading label={g.label} count={g.rows.length} desc={`${SCOPE_LABELS[g.scope] || ""} · ${g.code}`} compact />
                    <div className="overflow-hidden rounded-xl border border-border bg-surface-subtle">
                      <div className="-mt-px">
                        {g.rows.map((r) => (
                          <RuleRow
                            key={r.id}
                            rule={r}
                            asOf={asOf}
                            canEdit={canEdit}
                            canDelete={canEdit && canDeleteRecords}
                            onEdit={(rule) => setEditing(draftOf(rule))}
                            onOverride={(rule) => setEditing(draftOf(rule, { id: undefined, overrides: rule.id, verification: "checked", verifiedOn: "" }))}
                            onDelete={remove}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-surface-subtle">
                <EmptyState
                  icon={all.length ? SearchX : Scale}
                  title={all.length ? "No rules match" : "No screening rules yet"}
                  description={all.length ? "Try another topic or search." : "The shared catalog hasn't been loaded for this workspace yet."}
                  action={
                    all.length ? (
                      <Button
                        variant="outline"
                        className={OUTLINE_BUTTON}
                        onClick={() => {
                          setView("all");
                          setTopic("all");
                          setSearch("");
                        }}
                      >
                        Clear Filters
                      </Button>
                    ) : null
                  }
                />
              </div>
            )}
            <LegalFootnote className="pt-1">
              {RULES_CAVEAT} The shared catalog is re-checked each quarter; each rule shows the date it was last checked.
            </LegalFootnote>
          </section>
        </>
      )}
      {editing ? <RuleDialog key={editing.id || editing.overrides || "new"} draft={editing} onOpenChange={(o) => !o && setEditing(null)} onSave={save} /> : null}
    </MainScreenWrapper>
  );
}

export default ScreeningRulesScreen;
