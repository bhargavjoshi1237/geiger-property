"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  ExternalLink,
  Gavel,
  Receipt,
  ShieldCheck,
  SlidersHorizontal,
  UserCheck,
  XCircle,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { Field, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { WizardDialog } from "@/components/internal/shared/wizard_dialog";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords, recordItemsAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { listRecordItems } from "@/lib/supabase/record_items";
import { saveSetting } from "@/lib/supabase/settings";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { KeyValues, ProviderNotice, useLoad } from "./common";
import { applicationRent, householdIncome, loadScreeningCriteria } from "../flows";
import {
  APPLICATION_STATUS_MAP,
  FEE_KIND_OPTIONS,
  FEE_STATUS_OPTIONS,
  PAYMENT_METHOD_OPTIONS,
  SCREENING_CHECKS,
  SCREENING_CRITERIA_DEFAULTS,
  SCREENING_STATUS_MAP,
  currency,
  formatDate,
  selectOptions,
  todayISO,
} from "../shared";

// Application editor sections: overview, income-to-rent, internal screening,
// fee ledger, decision + conversion, and the company screening-criteria dialog.

// Rent, income and criteria for the income-to-rent ratio, keyed on what feeds it.
function useQualification(item) {
  return useLoad(async () => {
    const [criteria, rent] = await Promise.all([loadScreeningCriteria(), applicationRent(item)]);
    const income = await householdIncome(item, criteria);
    return { criteria, rent, income };
  }, [item.id, item.unitId, item.listingId, item.monthlyIncome, item.metadata?.otherIncome, item.metadata?.quotedRent]);
}

// Ratio + threshold (per-application override wins over company criteria).
export function ratioOf(q, item) {
  if (!q) return null;
  const threshold = Number(item.metadata?.incomeMultipleOverride) || Number(q.criteria.incomeMultiple) || 3;
  const ratio = q.rent ? q.income.total / q.rent : 0;
  return { ratio, threshold, pass: Boolean(q.rent) && ratio >= threshold, required: q.rent * threshold };
}

// Normalized screening state per check.
export function screeningState(item) {
  const raw = item.metadata?.screening || {};
  return Object.fromEntries(
    SCREENING_CHECKS.map((c) => [c.key, { status: "Not started", result: "", score: "", completedOn: "", notes: "", ...(raw[c.key] || {}) }]),
  );
}

export const screeningProgress = (item) =>
  Object.values(screeningState(item)).filter((s) => s.status === "Complete").length;

export function RatioCard({ item }) {
  const q = useQualification(item);
  const r = ratioOf(q, item);
  if (q === undefined) return <ListLoading label="Calculating income-to-rent" className="py-8" />;
  return (
    <KeyValues
      title="Income-to-rent"
      description={`Policy: household income at least ${r?.threshold ?? 3}× monthly rent${item.metadata?.incomeMultipleOverride ? " (overridden on this application)" : ""}.`}
      columns={3}
      items={[
        { label: "Monthly rent", value: q?.rent ? `${currency(q.rent)}/mo` : "Link a unit or listing" },
        { label: "Household income", value: q?.income.total ? `${currency(q.income.total)}/mo` : "—" },
        { label: "Required income", value: q?.rent ? `${currency(r.required)}/mo` : "—" },
        { label: "Applicant", value: q?.income.own ? currency(q.income.own) : "—" },
        { label: "Co-applicants", value: q?.income.co ? currency(q.income.co) : "—" },
        {
          label: "Ratio",
          value: q?.rent ? (
            <span className="inline-flex items-center gap-2">
              {r.ratio.toFixed(2)}×
              <Badge variant={r.pass ? "success" : "danger"}>{r.pass ? "Meets policy" : "Below policy"}</Badge>
            </span>
          ) : (
            "—"
          ),
        },
      ]}
    />
  );
}

const INCOME_FIELDS = [
  { key: "heading1", label: "Current employment", type: "heading" },
  { key: "employmentStatus", label: "Employment status", type: "select", meta: true, options: ["Employed", "Self-employed", "Student", "Retired", "Unemployed", "Other"].map((v) => ({ value: v, label: v })) },
  { key: "employer", label: "Employer", type: "text", meta: true },
  { key: "position", label: "Position", type: "text", meta: true },
  { key: "employmentStart", label: "Start date", type: "date", meta: true },
  { key: "supervisorName", label: "Supervisor", type: "text", meta: true },
  { key: "employerPhone", label: "Employer phone", type: "phone", meta: true },
  { key: "heading2", label: "Income", type: "heading" },
  { key: "monthlyIncome", label: "Gross monthly income", type: "currency" },
  { key: "otherIncome", label: "Other monthly income", type: "currency", meta: true },
  { key: "otherIncomeSource", label: "Other income source", type: "text", meta: true, placeholder: "e.g. Child support, benefits, investments" },
  { key: "voucher", label: "Housing voucher / subsidy", type: "switch", meta: true },
  { key: "voucherAmount", label: "Voucher amount (monthly)", type: "currency", meta: true, showIf: (i) => Boolean(i.metadata?.voucher ?? i.voucher) },
  { key: "incomeDocs", label: "Income documents received", type: "multiselect", meta: true, options: ["Pay stubs", "Offer letter", "Tax return", "Bank statements", "Benefit letter", "1099s"].map((v) => ({ value: v, label: v })) },
  { key: "heading3", label: "Previous employment", type: "heading" },
  { key: "prevEmployer", label: "Previous employer", type: "text", meta: true },
  { key: "prevEmploymentYears", label: "Years there", type: "number", meta: true, min: 0, step: 0.5 },
  { key: "heading4", label: "Policy", type: "heading" },
  { key: "quotedRent", label: "Rent to qualify against", type: "currency", meta: true, hint: "Only used when no unit or listing rent is linked." },
  { key: "incomeMultipleOverride", label: "Income multiple override", type: "number", meta: true, step: 0.1, hint: "Leave blank to use the company criteria." },
];

export function IncomeSection({ item, onPatch, onCommit, onCommitMeta }) {
  return (
    <div className="space-y-5">
      <RatioCard item={item} />
      <FieldsForm item={item} fields={INCOME_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
    </div>
  );
}

// One screening check: status, result, score and notes (all recorded manually).
function ScreeningCheck({ check, state, minCredit, onSave }) {
  const below = check.scored && state.score !== "" && Number(state.score) < minCredit;
  return (
    <SectionCard
      title={check.label}
      action={<StatusPill status={state.status} map={SCREENING_STATUS_MAP} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status">
          <Select value={state.status} onValueChange={(v) => onSave({ status: v, ...(v === "Complete" && !state.completedOn ? { completedOn: todayISO() } : {}) })}>
            <SelectTrigger className="bg-surface-card" aria-label={`${check.label} status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectOptions(SCREENING_STATUS_MAP).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Result">
          <Select value={state.result || ""} onValueChange={(v) => onSave({ result: v })}>
            <SelectTrigger className="bg-surface-card" aria-label={`${check.label} result`}>
              <SelectValue placeholder="Select…" />
            </SelectTrigger>
            <SelectContent>
              {check.results.map((r) => (
                <SelectItem key={r} value={r}>
                  {r}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        {check.scored ? (
          <Field label="Score" hint={below ? `Below the ${minCredit} minimum.` : `Minimum ${minCredit}.`}>
            <Input
              type="number"
              key={`score-${state.score}`}
              defaultValue={state.score}
              onBlur={(e) => e.target.value !== String(state.score) && onSave({ score: e.target.value === "" ? "" : Number(e.target.value) })}
            />
          </Field>
        ) : null}
        <Field label="Completed on">
          <Input
            type="date"
            key={`date-${state.completedOn}`}
            defaultValue={state.completedOn}
            onBlur={(e) => e.target.value !== state.completedOn && onSave({ completedOn: e.target.value })}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-full">
          <Textarea
            key={`notes-${state.notes}`}
            defaultValue={state.notes}
            placeholder="Findings, report reference, follow-up…"
            onBlur={(e) => e.target.value !== state.notes && onSave({ notes: e.target.value })}
          />
        </Field>
      </div>
    </SectionCard>
  );
}

export function ScreeningSection({ item, config, onPatch, onCommit, onCommitMeta, runAction }) {
  const state = screeningState(item);
  const criteria = useLoad(() => loadScreeningCriteria(), ["criteria"]);
  const minCredit = Number(criteria?.minCreditScore) || SCREENING_CRITERIA_DEFAULTS.minCreditScore;
  const done = screeningProgress(item);

  const save = async (key, patch) => {
    const next = { ...state, [key]: { ...state[key], ...patch } };
    if (!(await onCommitMeta({ screening: next }))) return;
    if (key === "credit" && "score" in patch) await onCommit({ score: Number(patch.score) || 0 });
    if (patch.status) {
      logSystemActivity(config.key, item.id, "screening", `${SCREENING_CHECKS.find((c) => c.key === key)?.label}: ${patch.status}`);
    }
  };

  return (
    <div className="space-y-5">
      <ProviderNotice what="Screening">
        Background, credit, eviction and income checks are not run from this app. Order them with your
        screening company and record the status, result and score here.
      </ProviderNotice>
      <SectionCard
        title="Screening progress"
        description={`${done} of ${SCREENING_CHECKS.length} checks complete.`}
        action={
          item.status === "Submitted" ? (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("startScreening")}>
              <ShieldCheck className="h-4 w-4" /> Start Screening
            </Button>
          ) : null
        }
      >
        <FieldsForm
          item={item}
          onPatch={onPatch}
          onCommit={onCommit}
          onCommitMeta={onCommitMeta}
          fields={[
            { key: "screeningConsent", label: "Applicant consent on file", type: "switch", meta: true },
            { key: "screeningConsentOn", label: "Consent date", type: "date", meta: true },
            { key: "screeningVendor", label: "Screening company", type: "text", meta: true, placeholder: "Recorded only" },
            { key: "screeningReference", label: "Report reference", type: "text", meta: true },
          ]}
        />
      </SectionCard>
      {SCREENING_CHECKS.map((c) => (
        <ScreeningCheck key={c.key} check={c} state={state[c.key]} minCredit={minCredit} onSave={(patch) => save(c.key, patch)} />
      ))}
    </div>
  );
}

const FEE_FIELDS = [
  { key: "name", label: "Description", type: "text", required: true, full: true },
  { key: "feeKind", label: "Fee type", type: "select", options: FEE_KIND_OPTIONS },
  { key: "amount", label: "Amount", type: "currency", required: true },
  { key: "status", label: "Status", type: "select", options: FEE_STATUS_OPTIONS },
  { key: "startsOn", label: "Date", type: "date" },
  { key: "method", label: "Method", type: "select", options: PAYMENT_METHOD_OPTIONS },
  { key: "reference", label: "Reference / receipt #", type: "text" },
  { key: "waiveReason", label: "Waiver / refund reason", type: "text" },
];

const feesAdapter = recordItemsAdapter("fee");

const FEE_VARIANT = { Paid: "success", Waived: "neutral", Refunded: "purple", Due: "warning" };

// Fee ledger in record_items; keeps the fee_paid column in sync with application-fee rows.
export function FeesSection({ item, config, onPatch, onCommit, onCommitMeta }) {
  const [fees, setFees] = useState(null);
  const loaded = useLoad(() => listRecordItems(config.key, item.id, "fee"), [item.id]);
  const rows = fees ?? loaded ?? [];
  const sum = (status) => rows.filter((r) => r.status === status).reduce((s, r) => s + (Number(r.amount) || 0), 0);

  const sync = (next) => {
    setFees(next);
    const appFees = next.filter((r) => (r.feeKind || r.metadata?.feeKind) === "Application fee");
    const paid = appFees.some((r) => r.status === "Paid" || r.status === "Waived");
    if (appFees.length && paid !== Boolean(item.feePaid)) onCommit({ feePaid: paid });
  };

  return (
    <div className="space-y-5">
      <Note />
      <FieldsForm
        item={item}
        onPatch={onPatch}
        onCommit={onCommit}
        onCommitMeta={onCommitMeta}
        fields={[
          { key: "applicationFee", label: "Application fee charged", type: "currency" },
          { key: "feePaid", label: "Application fee settled", type: "switch", hint: "Updates from the ledger below." },
        ]}
      />
      <KeyValues
        columns={3}
        items={[
          { label: "Collected", value: currency(sum("Paid")) },
          { label: "Due", value: currency(sum("Due")) },
          { label: "Waived / refunded", value: `${currency(sum("Waived"))} / ${currency(sum("Refunded"))}` },
        ]}
      />
      <ChildRecords
        item={item}
        config={config}
        adapter={feesAdapter}
        fields={FEE_FIELDS}
        singular="Fee"
        plural="Fees"
        icon={Receipt}
        onChange={sync}
        defaults={(i) => ({ name: "Application fee", feeKind: "Application fee", amount: i.applicationFee || "", status: "Due", startsOn: todayISO() })}
        emptyDescription="Record application fees, holding deposits and admin fees as paid, waived or refunded."
        summary={(f) => ({
          title: f.name,
          meta: [f.feeKind, formatDate(f.startsOn), f.method, f.reference].filter((x) => x && x !== "—").join(" · "),
          badge: f.status || "Due",
          badgeVariant: FEE_VARIANT[f.status] || "neutral",
          aside: currency(f.amount),
        })}
      />
    </div>
  );
}

function Note() {
  return (
    <p className="text-sm text-text-secondary">
      Fees are recorded only — no payment is processed here. Applicant payments can be collected through Rent Collection once a tenant exists.
    </p>
  );
}

export function DecisionSection({ item, runAction }) {
  const { openItemInTab } = useWorkspaceUrl();
  const m = item.metadata || {};
  const c = m.decisionConditions || {};
  const adverse = m.adverseAction || {};
  const q = useQualification(item);
  const r = ratioOf(q, item);
  const approved = ["Approved", "Conditionally approved"].includes(item.status);
  const converted = Boolean(item.leaseId) || item.status === "Converted";

  return (
    <div className="space-y-5">
      <KeyValues
        title="Decision"
        action={
          converted ? null : (
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("decide")}>
              <Gavel className="h-4 w-4" /> {item.decision ? "Change Decision" : "Record Decision"}
            </Button>
          )
        }
        items={[
          { label: "Status", value: <StatusPill status={item.status} map={APPLICATION_STATUS_MAP} /> },
          { label: "Decision", value: item.decision || "Pending" },
          { label: "Decided on", value: formatDate(m.decidedOn) },
          { label: "Decided by", value: m.decidedBy || "—" },
          { label: "Income-to-rent", value: r && q?.rent ? `${r.ratio.toFixed(2)}× (needs ${r.threshold}×)` : "—" },
          { label: "Screening", value: `${screeningProgress(item)} of ${SCREENING_CHECKS.length} complete` },
        ]}
      />
      {item.status === "Conditionally approved" ? (
        <KeyValues
          title="Conditions"
          items={[
            { label: "Additional deposit", value: c.extraDeposit ? currency(c.extraDeposit) : "—" },
            { label: "Cosigner / guarantor", value: c.cosignerRequired ? "Required" : "Not required" },
            { label: "Rent adjustment", value: c.rentAdjustment ? `${currency(c.rentAdjustment)}/mo` : "—" },
            { label: "Other", value: c.other || "—" },
          ]}
        />
      ) : null}
      {item.status === "Denied" ? (
        <KeyValues
          title="Adverse action"
          items={[
            { label: "Reasons", value: (adverse.reasons || []).join(", ") || "—" },
            { label: "Notice sent", value: formatDate(adverse.noticeSentOn) },
            { label: "Consumer report used", value: adverse.reportUsed ? "Yes — bureau disclosed in notice" : "No" },
            { label: "Notes", value: adverse.notes || "—" },
          ]}
        />
      ) : null}
      <SectionCard
        title="Lease"
        description="Converting creates the tenant, the lease and its parties, then closes out the prospect, waitlist entry and listing."
      >
        {converted ? (
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 text-sm text-text-secondary">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Lease created {m.convertedAt ? `on ${formatDate(m.convertedAt)}` : ""}
            </span>
            {item.tenantId ? (
              <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => openItemInTab(item.tenantId, "Tenants")}>
                <ExternalLink className="h-4 w-4" /> Open Tenant
              </Button>
            ) : null}
            {item.leaseId ? (
              <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => openItemInTab(item.leaseId, "Leases")}>
                <ExternalLink className="h-4 w-4" /> Open Lease
              </Button>
            ) : null}
          </div>
        ) : approved ? (
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("convertLease")}>
            <UserCheck className="h-4 w-4" /> Convert to Lease
          </Button>
        ) : (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <XCircle className="h-4 w-4" /> Approve the application to convert it to a lease.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

export function ApplicationOverviewSection({ item }) {
  const q = useQualification(item);
  const r = ratioOf(q, item);
  const state = screeningState(item);
  return (
    <div className="space-y-5">
      <KeyValues
        items={[
          { label: "Applicant", value: [item.name, item.email].filter(Boolean).join(" · ") },
          { label: "Phone", value: item.phone || "—" },
          { label: "Unit", value: item.unit || "—" },
          { label: "Listing", value: item.listingName || "—" },
          { label: "Requested move-in", value: formatDate(item.moveInDate) },
          { label: "Occupants", value: String(item.occupants || 1) },
          { label: "Applied", value: formatDate(item.appliedOn || item.createdAt) },
          { label: "Source", value: item.source || "—" },
          {
            label: "Income-to-rent",
            value:
              q === undefined ? "…" : q?.rent ? (
                <span className="inline-flex items-center gap-2">
                  {r.ratio.toFixed(2)}× <Badge variant={r.pass ? "success" : "danger"}>{r.pass ? "Meets" : "Below"} {r.threshold}×</Badge>
                </span>
              ) : (
                "No rent linked"
              ),
          },
          { label: "Application fee", value: item.applicationFee ? `${currency(item.applicationFee)} · ${item.feePaid ? "Settled" : "Unpaid"}` : "—" },
        ]}
      />
      <SectionCard title="Screening" description="Recorded manually — screening provider not connected.">
        <div className="flex flex-wrap gap-2">
          {SCREENING_CHECKS.map((c) => (
            <span key={c.key} className="inline-flex items-center gap-1.5 text-sm text-text-secondary">
              {c.label}: <StatusPill status={state[c.key].status} map={SCREENING_STATUS_MAP} />
              {state[c.key].result ? <span className="text-foreground">{state[c.key].result}</span> : null}
            </span>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}

// Header button + dialog editing the company screening criteria (settings `screening_criteria`).
export function ScreeningCriteriaButton() {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState(SCREENING_CRITERIA_DEFAULTS);
  const openDialog = async () => {
    setInitial(await loadScreeningCriteria());
    setOpen(true);
  };
  return (
    <>
      <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={openDialog}>
        <SlidersHorizontal className="h-4 w-4" /> Screening Criteria
      </Button>
      <WizardDialog
        open={open}
        onOpenChange={setOpen}
        title="Screening criteria"
        description="Company-wide qualification policy used for income-to-rent and credit checks. Applications can override the income multiple."
        initial={initial}
        finishLabel="Save Criteria"
        steps={[
          {
            key: "criteria",
            title: "Criteria",
            fields: [
              { key: "incomeMultiple", label: "Income multiple (× rent)", type: "number", step: 0.1, min: 1, required: true },
              { key: "minCreditScore", label: "Minimum credit score", type: "number", min: 300, max: 850 },
              { key: "evictionLookbackYears", label: "Eviction lookback (years)", type: "number", min: 0 },
              { key: "countCoApplicantIncome", label: "Count co-applicant income", type: "switch" },
              { key: "allowCosigner", label: "Allow cosigners to qualify", type: "switch" },
              { key: "criteriaNotes", label: "Published criteria text", type: "textarea", hint: "Share the same criteria with every applicant (fair housing)." },
            ],
          },
        ]}
        onFinish={async (v) => {
          const ok = await saveSetting("screening_criteria", {
            ...v,
            incomeMultiple: Number(v.incomeMultiple) || 3,
            minCreditScore: Number(v.minCreditScore) || 0,
            evictionLookbackYears: Number(v.evictionLookbackYears) || 0,
          });
          if (!ok) {
            toast.error("Couldn't save the screening criteria.");
            return false;
          }
          toast.success("Screening criteria saved.");
          return true;
        }}
      />
    </>
  );
}
