"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  Contact,
  Users,
  Wallet,
  ShieldCheck,
  Receipt,
  Gavel,
  Clock,
  ClipboardList,
  Info,
  Loader2,
  UserCheck,
  CheckCircle2,
} from "lucide-react";

import { Field, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { applicationsLayer } from "@/lib/supabase/applications";
import { prospectsLayer } from "@/lib/supabase/prospects";
import { leasesLayer } from "@/lib/supabase/leases";
import { createTenant, updateTenant } from "@/lib/supabase/tenants";
import { getUnit } from "@/lib/supabase/units";
import { prospectOptions, unitOptions } from "@/lib/supabase/options";
import {
  FieldsForm,
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  APPLICATION_STATUS_MAP,
  BACKGROUND_OPTIONS,
  EVICTION_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  selectOptions,
} from "./shared";

// Applications — rental applications and recorded screening results (owns
// `property.applications`). Approved applicants convert to a tenant + draft lease.

const IN_REVIEW = ["Submitted", "Screening"];
const APPROVED = ["Approved", "Conditionally approved"];
const CLOSED = ["Denied", "Withdrawn"];

// The linked unit (for rent), refetched when the unit relation changes.
function useUnit(unitId) {
  const [unit, setUnit] = useState(null);
  useEffect(() => {
    if (!unitId) return;
    let alive = true;
    getUnit(unitId).then((u) => alive && setUnit(u));
    return () => {
      alive = false;
    };
  }, [unitId]);
  return unit && unit.id === unitId ? unit : null;
}

function Note({ children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <p>{children}</p>
    </div>
  );
}

const INCOME_FIELDS = [
  { key: "monthlyIncome", label: "Gross monthly income", type: "number" },
  { key: "employer", label: "Employer", type: "text", meta: true },
  { key: "position", label: "Position", type: "text", meta: true },
  { key: "employmentLength", label: "Time employed", type: "text", meta: true, placeholder: "e.g. 3 years" },
  { key: "otherIncome", label: "Other monthly income", type: "number", meta: true },
];

// Income fields plus a read-only rent-to-income ratio when the unit's rent is known.
function IncomeSection({ item, onPatch, onCommit }) {
  const unit = useUnit(item.unitId);
  const income = Number(item.monthlyIncome) + Number(item.metadata?.otherIncome || 0);
  const rent = Number(unit?.rent) || 0;
  return (
    <div className="space-y-4">
      <FieldsForm item={item} fields={INCOME_FIELDS} onPatch={onPatch} onCommit={onCommit} />
      <SectionCard>
        <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Total income</dt>
            <dd className="mt-1 text-sm text-foreground">{income ? `${currency(income)}/mo` : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Unit rent</dt>
            <dd className="mt-1 text-sm text-foreground">{rent ? `${currency(rent)}/mo` : "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Income-to-rent</dt>
            <dd className="mt-1 text-sm text-foreground">
              {rent && income ? `${(income / rent).toFixed(1)}× rent` : "Link a unit and income"}
            </dd>
          </div>
        </dl>
      </SectionCard>
    </div>
  );
}

const SCREENING_FIELDS = [
  { key: "creditScore", label: "Credit score", type: "number", meta: true },
  { key: "backgroundCheck", label: "Background check", type: "select", meta: true, options: BACKGROUND_OPTIONS },
  { key: "evictionHistory", label: "Eviction history", type: "select", meta: true, options: EVICTION_OPTIONS },
  { key: "incomeVerified", label: "Income verified", type: "switch", meta: true },
  { key: "screeningNotes", label: "Screening notes", type: "textarea", meta: true },
];

function ScreeningSection(props) {
  return (
    <div className="space-y-4">
      <Note>
        Screening results are recorded manually here — credit and background checks aren&apos;t
        run by a provider from this app yet.
      </Note>
      <FieldsForm {...props} fields={SCREENING_FIELDS} />
    </div>
  );
}

// Decision status + reason, and the one-click conversion to a tenant + draft lease.
function DecisionSection({ item, onPatch, onCommit }) {
  const unit = useUnit(item.unitId);
  const [busy, setBusy] = useState(false);
  const meta = item.metadata || {};
  const converted = Boolean(meta.convertedTenantId);

  const writeReason = (v) => ({ decisionReason: v, metadata: { ...meta, decisionReason: v } });

  const convert = async () => {
    const name = String(item.name || "").trim();
    if (!name) {
      toast.error("Give this application an applicant name first.");
      return;
    }
    setBusy(true);
    const u = item.unitId ? unit || (await getUnit(item.unitId)) : null;
    const tenantId = crypto.randomUUID();
    const leaseId = crypto.randomUUID();
    const tenant = await createTenant({
      id: tenantId,
      name,
      email: item.email || "",
      phone: item.phone || "",
      unit: item.unit || "",
      unitId: item.unitId || "",
      propertyId: u?.propertyId || "",
      status: "Current",
    });
    if (!tenant) {
      setBusy(false);
      toast.error("Couldn't create the tenant.");
      return;
    }
    const lease = await leasesLayer.create({
      id: leaseId,
      name: `${item.unit || "Unit"} — ${name}`,
      unit: item.unit || "",
      unitId: item.unitId || "",
      propertyId: u?.propertyId || "",
      tenantId,
      tenantName: name,
      rent: Number(u?.rent) || 0,
      termStart: item.moveInDate || "",
      status: "Draft",
    });
    if (lease) await updateTenant(tenantId, { leaseId });
    onCommit({
      status: "Approved",
      metadata: {
        ...meta,
        convertedTenantId: tenantId,
        convertedLeaseId: lease ? leaseId : null,
        convertedAt: new Date().toISOString(),
      },
    });
    setBusy(false);
    if (lease) toast.success(`${name} is now a tenant with a draft lease.`);
    else toast.error("Tenant created, but the draft lease couldn't be saved.");
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="grid gap-4">
          <Field label="Decision" htmlFor="decision-status">
            <Select value={item.status || ""} onValueChange={(v) => onCommit({ status: v })}>
              <SelectTrigger id="decision-status" className="bg-surface-card">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {selectOptions(APPLICATION_STATUS_MAP).map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Reason" htmlFor="decision-reason" hint="Conditions, adverse-action reasons, or approval notes.">
            <Textarea
              id="decision-reason"
              value={meta.decisionReason ?? ""}
              placeholder="Why was this application approved, conditioned, or denied?"
              onChange={(e) => onPatch(writeReason(e.target.value))}
              onBlur={(e) => onCommit(writeReason(e.target.value))}
            />
          </Field>
        </div>
      </SectionCard>

      <SectionCard
        title="Convert to tenant"
        description="Creates a tenant record and a draft lease for this applicant, linked to the unit, and marks the application approved."
      >
        {converted ? (
          <div className="flex items-start gap-2.5 text-sm text-text-secondary">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            <p>
              Converted {meta.convertedAt ? `on ${formatDate(meta.convertedAt)}` : ""} — find the tenant
              under Tenants{meta.convertedLeaseId ? " and the draft lease under Leases" : ""}.
            </p>
          </div>
        ) : (
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={busy || item.status === "Denied" || item.status === "Withdrawn"}
            onClick={convert}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Convert to tenant + draft lease
          </Button>
        )}
      </SectionCard>
    </div>
  );
}

// Prospects for the create dialog — picking one prefills the applicant's contact.
async function applicantProspectOptions() {
  const rows = (await prospectsLayer.list()) ?? [];
  return rows.map((p) => ({
    value: p.id,
    label: p.name || "Prospect",
    patch: { name: p.name || "", email: p.email || "", phone: p.phone || "" },
  }));
}

const applicationsConfig = {
  key: "application",
  singular: "Application",
  plural: "Applications",
  title: "Applications",
  description:
    "Review rental applications end to end — applicant details, income, recorded screening results, fees, and the final decision.",
  icon: ClipboardList,
  titleField: "name",
  searchFields: ["name", "email", "phone", "unit"],
  data: applicationsLayer.data,

  statusMap: APPLICATION_STATUS_MAP,
  statusFilterOptions: filterOptions(APPLICATION_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "review", label: "In review", filter: (r) => IN_REVIEW.includes(r.status) },
    { value: "approved", label: "Approved", filter: (r) => APPROVED.includes(r.status) },
    { value: "closed", label: "Closed", filter: (r) => CLOSED.includes(r.status) },
  ],

  columns: [
    {
      key: "name",
      header: "Applicant",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit linked"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={APPLICATION_STATUS_MAP} />,
    },
    {
      key: "feePaid",
      header: "Fee",
      render: (r) =>
        r.applicationFee ? (
          <Badge variant={r.feePaid ? "success" : "warning"}>{r.feePaid ? "Paid" : "Unpaid"}</Badge>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "monthlyIncome",
      header: "Income",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => (r.monthlyIncome ? `${currency(r.monthlyIncome)}/mo` : "—"),
    },
    {
      key: "createdAt",
      header: "Submitted",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.createdAt),
    },
  ],

  stats: (rows) => {
    const approved = rows.filter((r) => APPROVED.includes(r.status)).length;
    const denied = rows.filter((r) => r.status === "Denied").length;
    const decided = approved + denied;
    return [
      { label: "Applications", value: String(rows.length), footer: "All time" },
      { label: "In review", value: String(rows.filter((r) => IN_REVIEW.includes(r.status)).length), footer: "Submitted or screening" },
      { label: "Approved", value: String(approved), footer: "Incl. conditional" },
      { label: "Approval rate", value: decided ? `${Math.round((approved / decided) * 100)}%` : "—", footer: `${decided} decided` },
    ];
  },

  createDraft: { prospectId: "", name: "", email: "", phone: "", unitId: "" },
  createFields: [
    {
      key: "prospectId",
      label: "From prospect (optional)",
      type: "select",
      optionsFrom: "prospects",
      placeholder: "Select a prospect…",
      emptyLabel: "No prospects yet",
    },
    { key: "name", label: "Applicant name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "jordan@example.com" },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet",
    },
  ],
  loadCreateOptions: async () => {
    const [prospects, units] = await Promise.all([applicantProspectOptions(), unitOptions()]);
    return { prospects, units };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email?.trim() || "",
    phone: draft.phone?.trim() || "",
    prospectId: draft.prospectId || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    status: "Submitted",
  }),

  headerMeta: (r) => [r.unit, r.email, r.phone].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this application." },
      ],
    },
    {
      group: "Applicant",
      items: [
        { key: "applicant", label: "Applicant", icon: Contact, desc: "Contact details and the unit applied for." },
        { key: "occupants", label: "Co-applicants & occupants", icon: Users, desc: "Everyone who will live in the unit." },
        { key: "income", label: "Income", icon: Wallet, desc: "Employment and income." },
      ],
    },
    {
      group: "Review",
      items: [
        { key: "screening", label: "Screening", icon: ShieldCheck, desc: "Recorded credit, background, and eviction results." },
        { key: "fees", label: "Fees", icon: Receipt, desc: "Application fee and payment." },
        { key: "decision", label: "Decision", icon: Gavel, desc: "Approve, condition, or deny — and convert to a tenant." },
      ],
    },
    {
      group: "General",
      items: [{ key: "activity", label: "Activity", icon: Clock, desc: "Notes and activity on this application." }],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "unit", label: "Unit" },
        { key: "moveInDate", label: "Desired move-in", format: (v) => formatDate(v) },
        { key: "monthlyIncome", label: "Monthly income", format: (v) => (v ? `${currency(v)}/mo` : "—") },
        { key: "creditScore", label: "Credit score", meta: true },
        { key: "feePaid", label: "Application fee", format: (v, item) => (item.applicationFee ? `${currency(item.applicationFee)} · ${v ? "Paid" : "Unpaid"}` : "—") },
        { key: "status", label: "Status" },
      ],
    }),
    applicant: makeFieldsSection([
      { key: "name", label: "Applicant name", type: "text", full: true },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "moveInDate", label: "Desired move-in", type: "date" },
      { key: "prospectId", label: "Prospect", type: "relation", load: prospectOptions },
      { key: "dateOfBirth", label: "Date of birth", type: "date", meta: true },
      { key: "currentAddress", label: "Current address", type: "text", meta: true, full: true },
    ]),
    occupants: makeMetaListSection({
      field: "coApplicants",
      singular: "household member",
      icon: Users,
      primaryPlaceholder: "Full name",
      secondary: { key: "relationship", label: "Relationship", placeholder: "e.g. Co-applicant, Child" },
    }),
    income: IncomeSection,
    screening: ScreeningSection,
    fees: makeFieldsSection([
      { key: "applicationFee", label: "Application fee", type: "number" },
      { key: "feePaid", label: "Fee paid", type: "switch" },
      { key: "feePaidDate", label: "Paid on", type: "date", meta: true },
      {
        key: "feeMethod",
        label: "Payment method",
        type: "select",
        meta: true,
        options: [
          { value: "Card", label: "Card" },
          { value: "ACH", label: "ACH" },
          { value: "Check", label: "Check" },
          { value: "Cash", label: "Cash" },
          { value: "Money order", label: "Money order" },
        ],
        hint: "Recorded only — payments aren't processed here.",
      },
    ]),
    decision: DecisionSection,
    activity: makeNotesSection({ field: "notes", placeholder: "Notes and activity on this application…" }),
  },
};

export function ApplicationsScreen() {
  return <EntityListScreen config={applicationsConfig} />;
}

export default ApplicationsScreen;
