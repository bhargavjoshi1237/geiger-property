"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, BookMarked, Info, Loader2, MapPin, Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Field, ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { LegalFootnote } from "@/components/internal/screens/legal/parts";
import { usePermission, useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { isSandbox } from "@/lib/sandbox/sandbox_mode";
import { screeningRulesApi } from "@/lib/screening/api";
import { jurisdictionCodesFor, jurisdictionLabel, mergeEffects, parseJurisdictionOverride, withShadowing } from "@/lib/screening/jurisdictions";
import { resolveScreeningCriteria, screeningCriteriaValues } from "@/lib/screening/criteria_policy";
import { listScreeningRules } from "@/lib/supabase/screening_rules";
import { listProperties } from "@/lib/supabase/properties";
import { PRE_OFFER_FIELDS, criteriaWarnings, feeWarnings, hiddenApplicantFields, packageChecks } from "@/lib/screening/rules_enforcement";
import { EFFECT_FIELDS, STATUS_MAP, VERIFICATION_MAP, formatEffect } from "@/lib/screening/rules_schema";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { Note, useLoad } from "./common";
import { recordPropertyId } from "../flows";

// Location-specific screening rules (RISK-05): the rules-in-effect card, applicant questions hidden where the law bars them,
// package and fee notices. Data comes from GET /api/screening/rules; the rules only warn and adjust these forms.

export const RULES_SETTINGS_TAB = "Screening Rules";
export const RULES_CAVEAT =
  "Reference rules linked to their official sources, not legal advice. Laws change and some entries rest partly on secondary sources: verify each against its source before relying on it. Geiger warns and adjusts its own forms; your team makes the decision.";

const GROUP_LABELS = {
  criminal: "Criminal history",
  preOfferInquiryBanned: "Before a conditional offer",
  eviction: "Eviction history",
  income: "Income",
  sourceOfIncome: "Source of income",
  credit: "Credit",
  fees: "Application fees",
  process: "Process",
  notices: "Notices",
};

const REASON_LABELS = { not_yet: "Not yet in force", ended: "No longer in force", replaced: "Replaced by your rule" };

// The API's response with `merged` ({ values, fields }) for the enforcement helpers; { ok:false } stays as is.
const withMerged = (res) => (res?.ok ? { ...res, merged: { values: res.effects, fields: res.fields } } : res);

async function fetchRules(propertyId) {
  if (isSandbox()) return { ok: false, unavailable: true, error: "Location rules aren't loaded in the playground." };
  return withMerged(await screeningRulesApi(propertyId || ""));
}

// Rules for an application or listing (resolved through its property), outside React.
export const loadRecordScreeningRules = async (record) => fetchRules(await recordPropertyId(record));

// Rules at a property; `version` refetches when what picks the jurisdiction changes. undefined while loading.
export function useScreeningRules(propertyId, version = "") {
  return useLoad(() => fetchRules(propertyId), [propertyId || "", version]);
}

// Rules for an application or listing, through its property.
export function useRecordScreeningRules(record) {
  return useLoad(() => loadRecordScreeningRules(record), [record?.id, record?.propertyId, record?.unitId, record?.listingId]);
}

export function VerificationBadge({ verification, verifiedOn }) {
  const meta = VERIFICATION_MAP[verification] || VERIFICATION_MAP.checked;
  return (
    <Badge variant={meta.variant} title={`${meta.note}${verifiedOn ? ` Last checked ${verifiedOn}.` : ""}`}>
      {meta.label}
    </Badge>
  );
}

// A rule's citation linking to its source, with where it applies.
export function RuleSourceLink({ source, muted }) {
  const label = source.citation || source.title;
  return (
    <span className={cn("inline-flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-xs", muted ? "text-text-tertiary" : "text-text-secondary")}>
      <span className="whitespace-nowrap">{jurisdictionLabel(source.jurisdictionCode, source.scope)}</span>
      <span aria-hidden>·</span>
      {source.sourceUrl ? (
        <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-0.5 underline-offset-2 hover:text-foreground hover:underline">
          <span className="truncate">{label}</span>
          <ArrowUpRight className="size-3 shrink-0" />
        </a>
      ) : (
        <span className="truncate">{label}</span>
      )}
      {source.custom ? <Badge variant="info">Your rule</Badge> : null}
    </span>
  );
}

// Warnings and reminders, each naming the rule behind it.
export function RuleNotices({ notices, className }) {
  if (!notices?.length) return null;
  return (
    <ul className={cn("space-y-2", className)}>
      {notices.map((n, i) => {
        const warn = n.severity === "warn";
        const Icon = warn ? AlertTriangle : Info;
        return (
          <li
            key={`${n.path}-${i}`}
            className={cn(
              "flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm",
              warn ? "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-300" : "border-border bg-surface-card text-text-secondary",
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", warn ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")} />
            <div className="min-w-0">
              <p>{n.message}</p>
              {n.citation ? <p className={cn("mt-0.5 text-xs", warn ? "text-amber-700/80 dark:text-amber-300/80" : "text-text-tertiary")}>{n.citation}</p> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// The jurisdiction chain as chips, with how it was found.
function JurisdictionChain({ jurisdiction }) {
  const kinds = { 1: "state", 2: jurisdiction?.county ? "county" : "city", 3: "city" };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <MapPin className="h-3.5 w-3.5 text-text-tertiary" />
      {(jurisdiction?.codes || ["US"]).map((code, i) => (
        <Badge key={code} variant="outline" className="font-normal">
          {jurisdictionLabel(code, kinds[i])}
        </Badge>
      ))}
      {jurisdiction?.overridden ? <Badge variant="info">Set by hand</Badge> : null}
      {jurisdiction?.countyInferred ? <span className="text-xs text-text-tertiary">County inferred from the city; add it under Details → Address to confirm.</span> : null}
    </div>
  );
}

// Merged effects by topic: label, the value in force, and every rule that set it (deciding rules first).
function EffectRows({ fields }) {
  const groups = [];
  for (const f of EFFECT_FIELDS) {
    const entry = fields?.[f.path];
    if (!entry) continue;
    const group = f.path.split(".")[0];
    let g = groups.find((x) => x.key === group);
    if (!g) groups.push((g = { key: group, rows: [] }));
    g.rows.push({ field: f, entry });
  }
  if (!groups.length) return null;
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
      {groups.map((g) => (
        <div key={g.key} className="px-4 py-3">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{GROUP_LABELS[g.key] || g.key}</p>
          <dl className="mt-2 space-y-2.5">
            {g.rows.map(({ field, entry }) => {
              const sources = [...entry.sources].sort((a, b) => Number(b.wins) - Number(a.wins));
              return (
                <div key={field.path} className="grid gap-1 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)] sm:gap-4">
                  <dt className="text-sm text-text-secondary">{field.label}</dt>
                  <dd className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-foreground">{formatEffect(field.path, entry.value)}</p>
                    {sources.map((s) => (
                      <div key={s.ruleId} className="flex flex-wrap items-center gap-1.5">
                        <RuleSourceLink source={s} muted={!s.wins} />
                        {s.wins ? <VerificationBadge verification={s.verification} verifiedOn={s.verifiedOn} /> : <span className="text-[11px] text-text-tertiary">({formatEffect(field.path, s.value)})</span>}
                      </div>
                    ))}
                  </dd>
                </div>
              );
            })}
          </dl>
        </div>
      ))}
    </div>
  );
}

// Rules on file for this place that aren't in force (withdrawn, enjoined, pending, replaced…): shown, never applied.
function InactiveRules({ rules }) {
  if (!rules.length) return null;
  return (
    <div className="space-y-2">
      <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">On file, not applied</p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <div className="min-w-0">
              <p className="text-sm text-foreground">{r.title}</p>
              <RuleSourceLink source={{ ...r, ruleId: r.id }} muted />
            </div>
            <Badge variant={r.shadowedBy ? "info" : STATUS_MAP[r.status]?.variant || "neutral"}>
              {r.shadowedBy ? REASON_LABELS.replaced : r.status === "active" ? REASON_LABELS[r.reason] || "Not in force" : STATUS_MAP[r.status]?.label || r.status}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Dialog to pin a property's jurisdiction codes by hand (metadata.screeningJurisdictionOverride; screening.criteria).
function OverrideDialog({ open, onOpenChange, value, onSave }) {
  const [draft, setDraft] = useState(value || "");
  const [busy, setBusy] = useState(false);
  const codes = parseJurisdictionOverride(draft);
  const save = async (next) => {
    setBusy(true);
    const ok = await onSave(next);
    setBusy(false);
    if (ok !== false) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Screening jurisdiction</DialogTitle>
          <DialogDescription>
            Rules follow the property&apos;s state, county and city. Set codes by hand only when the address doesn&apos;t say where
            the property legally sits, e.g. a neighbourhood name in the city field.
          </DialogDescription>
        </DialogHeader>
        <Field label="Local jurisdiction codes" hint="Comma-separated, e.g. US-NY-NYC or US-IL-COOK, US-IL-CHICAGO. Federal and the state are added for you.">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="US-NY-NYC" className="font-mono" />
        </Field>
        {draft.trim() && !codes.length ? <p className="text-sm text-red-600 dark:text-red-400">No valid codes yet.</p> : null}
        <DialogFooter>
          {value ? (
            <Button variant="ghost" className="mr-auto text-text-secondary" disabled={busy} onClick={() => save("")}>
              Use the Address
            </Button>
          ) : null}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !codes.length} onClick={() => save(codes.join(", "))}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "Screening rules in effect": the jurisdiction, warnings against this property's criteria and fee, the merged effects with
// their sources and verification, and the rules on file that don't apply. `onSaveOverride` adds the jurisdiction editor.
export function ScreeningRulesCard({ rules, warnings = [], override, onSaveOverride, title = "Screening rules in effect", description }) {
  const { openTabSection } = useWorkspaceUrl();
  const { canView } = useRbac();
  const canOverride = usePermission("property.screening.criteria");
  const [editing, setEditing] = useState(false);
  if (rules === undefined) return <ListLoading label="Loading screening rules" className="py-8" />;
  if (!rules?.ok) {
    return (
      <SectionCard title={title}>
        <p className="text-sm text-text-secondary">{rules?.error || "Couldn't load the screening rules."}</p>
      </SectionCard>
    );
  }
  const inForce = rules.rules.filter((r) => r.inForce && !r.shadowedBy).length;
  const inactive = rules.rules.filter((r) => !r.inForce || r.shadowedBy);
  return (
    <SectionCard
      title={title}
      description={description || `${inForce ? `${inForce} ${inForce === 1 ? "rule" : "rules"} in force here` : "No location rules on file for this place yet"}, most protective value first. Federal fair housing law applies everywhere.`}
      action={
        <div className="flex flex-wrap gap-2">
          {onSaveOverride && canOverride ? (
            <Button variant="outline" size="sm" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => setEditing(true)}>
              <MapPin className="h-4 w-4" /> Jurisdiction
            </Button>
          ) : null}
          {canView(RULES_SETTINGS_TAB) ? (
            <Button variant="ghost" size="sm" className="text-text-secondary hover:bg-surface-hover hover:text-foreground" onClick={() => openTabSection(RULES_SETTINGS_TAB)}>
              <Scale className="h-4 w-4" /> All Rules
            </Button>
          ) : null}
        </div>
      }
    >
      <div className="space-y-4">
        <JurisdictionChain jurisdiction={rules.jurisdiction} />
        <RuleNotices notices={warnings} />
        {inForce ? (
          <EffectRows fields={rules.fields} />
        ) : (
          <Note icon={BookMarked}>No state or local screening rules in the catalog apply here. Check Legal Resources for this state.</Note>
        )}
        <InactiveRules rules={inactive} />
        <LegalFootnote>{RULES_CAVEAT}</LegalFootnote>
      </div>
      {onSaveOverride ? <OverrideDialog key={String(editing)} open={editing} onOpenChange={setEditing} value={override} onSave={onSaveOverride} /> : null}
    </SectionCard>
  );
}

// Warnings for a property's screening criteria and application fee against its rules.
export const propertyRuleWarnings = (rules, criteria, applicationFee) =>
  rules?.ok ? [...criteriaWarnings(criteria || {}, rules.merged), ...feeWarnings(applicationFee, rules.merged)] : [];

const HIDDEN_WHY = {
  inquiry_banned: (what) => `Asking about ${what} before a conditional offer isn't allowed at this property.`,
  not_considered: (what) => `The rules here bar using ${what} to decide, so applicants aren't asked to disclose it.`,
  after_offer: (what) => `${what.charAt(0).toUpperCase()}${what.slice(1)} may only be reviewed after a conditional offer here.`,
};

// A fields section that drops the applicant questions the rules bar before a conditional offer (and says why).
export function makeRuleAwareFieldsSection(fields) {
  function RuleAwareFieldsSection({ item, onPatch, onCommit, onCommitMeta }) {
    const rules = useRecordScreeningRules(item);
    const hidden = rules?.ok ? hiddenApplicantFields(rules.merged) : [];
    // Pre-offer questions wait for the rules, so a barred one never flashes up.
    const keys = new Set(rules === undefined ? Object.values(PRE_OFFER_FIELDS).flat() : hidden.map((h) => h.key));
    return (
      <div className="space-y-5">
        {hidden.map((h) => (
          <Note key={h.key} icon={Scale}>
            <span className="font-medium text-foreground">{h.topic === "criminal" ? "The conviction question is hidden here." : "The eviction question is hidden here."}</span>{" "}
            {HIDDEN_WHY[h.why](h.topic === "criminal" ? "criminal history" : "eviction history")}
            {h.reason ? <span className="text-text-tertiary"> ({h.reason})</span> : null}
          </Note>
        ))}
        <FieldsForm item={item} fields={fields.filter((f) => !keys.has(f.key))} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </div>
    );
  }
  return RuleAwareFieldsSection;
}

// Checks the property's rules leave out of a screening package or hold until a conditional offer.
export function PackageRulesNotice({ rules, labels }) {
  if (!rules?.ok) return null;
  const pkg = packageChecks(rules.merged);
  const notices = [
    ...pkg.excluded.map((x) => ({ path: x.key, severity: "warn", message: `${labels[x.key] || x.key} isn't part of the screening package at this property: the rules here bar using it (see the rule for any narrow exceptions).`, citation: x.reason })),
    ...pkg.deferred.map((x) => ({ path: x.key, severity: "info", message: `${labels[x.key] || x.key} may only be run after a conditional offer, with an individualized assessment.`, citation: x.reason })),
  ];
  return <RuleNotices notices={notices} />;
}

// Fees & Policies: the properties whose location rules conflict with the company criteria in force there (read through the
// browser's catalog and properties, merged with the same pure code as the API).
export function PortfolioRulesNotice({ company }) {
  const { openItemInTab } = useWorkspaceUrl();
  const data = useLoad(() => Promise.all([listScreeningRules(), listProperties()]), []);
  const rows = useMemo(() => {
    const [rules, properties] = data || [];
    if (!rules?.length || !properties?.length) return [];
    const catalog = withShadowing(rules);
    return properties
      .filter((p) => !["Archived", "Inactive"].includes(p.status))
      .map((p) => {
        const codes = jurisdictionCodesFor(p);
        const merged = mergeEffects(catalog.filter((r) => codes.includes(r.jurisdictionCode)));
        const criteria = screeningCriteriaValues(resolveScreeningCriteria({ company, property: p }));
        return { property: p, warnings: criteriaWarnings(criteria, merged).filter((w) => w.severity === "warn") };
      })
      .filter((x) => x.warnings.length);
  }, [data, company]);
  if (!rows.length) return null;
  return (
    <Note icon={Scale} className="mt-5">
      <p className="font-medium text-foreground">
        Location rules conflict with these criteria at {rows.length === 1 ? "1 property" : `${rows.length} properties`}.
      </p>
      <ul className="mt-2 space-y-1.5">
        {rows.map(({ property, warnings }) => (
          <li key={property.id}>
            <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={() => openItemInTab(property.id, "Properties", "screeningPolicy")}>
              {property.name}
            </button>
            <span className="text-text-secondary">: {warnings.map((w) => w.message).join(" ")}</span>
          </li>
        ))}
      </ul>
    </Note>
  );
}

// Application-fee warnings for one fee amount (RISK-10 will enforce).
export function FeeRulesNotice({ record, amount }) {
  const rules = useRecordScreeningRules(record);
  return rules?.ok ? <RuleNotices notices={feeWarnings(amount, rules.merged)} /> : null;
}
