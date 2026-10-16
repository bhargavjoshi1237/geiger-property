"use client";

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
  Home,
  Baby,
  PawPrint,
  Car,
  History,
  BookUser,
  FileText,
  Tags,
  StickyNote,
  UserCheck,
  Undo2,
  RotateCcw,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { Badge } from "@/components/ui/badge";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { DocumentsSection, ActivitySection } from "@/components/internal/screens/entity/shared_sections";
import {
  makeFieldsSection,
  makeNotesSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { applicationsLayer } from "@/lib/supabase/applications";
import { listUnits } from "@/lib/supabase/units";
import { getProperty } from "@/lib/supabase/properties";
import { getSetting } from "@/lib/supabase/settings";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { effectivePolicies } from "@/lib/policies";
import {
  listingOptionsWithUnit,
  marketingUnitOptions,
  prospectContactOptions,
} from "@/lib/supabase/marketing_options";
import {
  ApplicationOverviewSection,
  DecisionSection,
  FeesSection,
  IncomeSection,
  ScreeningCriteriaButton,
  ScreeningSection,
  screeningProgress,
  screeningState,
} from "./sections/application_sections";
import { OWNER, applicationRent, convertApplicationToLease, loadFunnel, loadScreeningCriteria } from "./flows";
import {
  ADVERSE_ACTION_REASONS,
  APPLICATION_STATUS_MAP,
  APP_APPROVED,
  APP_CLOSED,
  APP_IN_REVIEW,
  PARTY_ROLE_OPTIONS,
  SCREENING_CHECKS,
  SOURCE_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  pct,
  termEndISO,
  todayISO,
  toOptions,
} from "./shared";

// Applications — rental applications (owns `property.applications`): applicant
// and household, income-to-rent against policy, internal screening (provider not
// connected), fee ledger, decision wizard with conditions / adverse action, and
// conversion to tenant + lease + lease parties.

const ctxCache = { funnel: null, rentByUnit: new Map(), criteria: null };

// Rows with the unit rent joined for the income-ratio column.
async function loadApplications() {
  const [rows, units, f, criteria] = await Promise.all([applicationsLayer.list(), listUnits(), loadFunnel(), loadScreeningCriteria()]);
  ctxCache.funnel = f;
  ctxCache.criteria = criteria;
  ctxCache.rentByUnit = new Map((units ?? []).map((u) => [u.id, Number(u.rent) || 0]));
  return rows;
}

const listRatio = (r) => {
  const rent = ctxCache.rentByUnit.get(r.unitId) || Number(r.metadata?.quotedRent) || 0;
  const income = (Number(r.monthlyIncome) || 0) + (Number(r.metadata?.otherIncome) || 0);
  if (!rent || !income) return null;
  const threshold = Number(r.metadata?.incomeMultipleOverride) || Number(ctxCache.criteria?.incomeMultiple) || 3;
  return { ratio: income / rent, pass: income / rent >= threshold };
};

const daysBetween = (a, b) => (a && b ? Math.max(0, Math.round((new Date(b) - new Date(a)) / 86400000)) : null);

// Default deposit from the fees policy (company → property), plus any extra-deposit condition.
async function defaultDeposit(app, rent) {
  const [company, property] = await Promise.all([
    getSetting("fees_policies", {}),
    app.propertyId ? getProperty(app.propertyId) : null,
  ]);
  const p = effectivePolicies({ company: company || {}, property });
  const base = p.depositRule === "fixed" ? Number(p.fixedDeposit) || 0 : rent;
  return base + (Number(app.metadata?.decisionConditions?.extraDeposit) || 0);
}

const APPLICANT_FIELDS = [
  { key: "name", label: "Applicant name", type: "text", full: true, required: true },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "dateOfBirth", label: "Date of birth", type: "date", meta: true },
  { key: "idType", label: "ID type", type: "select", meta: true, options: toOptions(["Driver's license", "State ID", "Passport", "Other"]) },
  { key: "idLast4", label: "ID last 4", type: "text", meta: true, hint: "Never store full ID or SSN numbers here." },
  { key: "currentAddress", label: "Current address", type: "text", meta: true, full: true },
  { key: "emergencyContact", label: "Emergency contact", type: "text", meta: true },
  { key: "emergencyPhone", label: "Emergency phone", type: "phone", meta: true },
  { key: "smoker", label: "Smoker", type: "switch", meta: true },
  { key: "evictedBefore", label: "Disclosed a prior eviction", type: "switch", meta: true },
  { key: "felonyDisclosed", label: "Disclosed a conviction", type: "switch", meta: true },
  { key: "disclosureNotes", label: "Disclosure notes", type: "textarea", meta: true },
];

const UNIT_FIELDS = [
  { key: "unitId", label: "Unit", type: "relation", load: marketingUnitOptions, displayKey: "unit" },
  { key: "listingId", label: "Listing", type: "relation", load: listingOptionsWithUnit, displayKey: "listingName" },
  { key: "prospectId", label: "Prospect", type: "relation", load: prospectContactOptions, displayKey: "prospectName" },
  { key: "propertyName", label: "Property", type: "readonly" },
  { key: "moveInDate", label: "Requested move-in", type: "date" },
  { key: "leaseTermRequested", label: "Lease term requested", type: "select", meta: true, options: toOptions(["Month-to-month", "6 months", "12 months", "18 months", "24 months"]) },
  { key: "source", label: "Source", type: "select", options: SOURCE_OPTIONS },
  { key: "appliedOn", label: "Applied on", type: "date" },
];

const HOUSEHOLD_FIELDS = [
  { key: "occupants", label: "Total occupants", type: "number", min: 1 },
  { key: "adults", label: "Adults", type: "number", meta: true, min: 0 },
  { key: "minors", label: "Minors", type: "number", meta: true, min: 0 },
  { key: "householdNotes", label: "Household notes", type: "textarea", meta: true },
];

const CO_APPLICANT_FIELDS = [
  { key: "name", label: "Full name", type: "text", required: true, full: true },
  { key: "role", label: "Role", type: "select", options: PARTY_ROLE_OPTIONS, required: true },
  { key: "relationship", label: "Relationship", type: "text", placeholder: "e.g. Spouse, Roommate, Parent" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "employer", label: "Employer", type: "text" },
  { key: "amount", label: "Gross monthly income", type: "currency" },
  { key: "status", label: "Screening", type: "select", options: toOptions(["Not started", "Requested", "Complete", "Failed"]) },
  { key: "screeningNotes", label: "Screening notes", type: "textarea" },
];

const OCCUPANT_FIELDS = [
  { key: "name", label: "Full name", type: "text", required: true },
  { key: "relationship", label: "Relationship", type: "text" },
  { key: "dateOfBirth", label: "Date of birth", type: "date" },
  { key: "minor", label: "Minor", type: "switch" },
];

const PET_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "petType", label: "Type", type: "select", options: toOptions(["Dog", "Cat", "Bird", "Fish", "Small animal", "Other"]) },
  { key: "breed", label: "Breed", type: "text" },
  { key: "weightLbs", label: "Weight (lbs)", type: "number", min: 0 },
  { key: "assistanceAnimal", label: "Assistance animal", type: "switch", hint: "Not a pet — no pet fees apply." },
  { key: "vaccinated", label: "Vaccinations current", type: "switch" },
];

const VEHICLE_FIELDS = [
  { key: "name", label: "Make & model", type: "text", required: true },
  { key: "year", label: "Year", type: "number" },
  { key: "color", label: "Color", type: "text" },
  { key: "plate", label: "Plate", type: "text" },
  { key: "plateState", label: "State", type: "text" },
];

const RESIDENCE_FIELDS = [
  { key: "name", label: "Address", type: "text", required: true, full: true },
  { key: "status", label: "Residence", type: "select", options: toOptions(["Current", "Previous"]) },
  { key: "ownership", label: "Rent or own", type: "select", options: toOptions(["Rent", "Own", "Family", "Other"]) },
  { key: "startsOn", label: "From", type: "date" },
  { key: "endsOn", label: "To", type: "date" },
  { key: "amount", label: "Monthly rent", type: "currency" },
  { key: "landlordName", label: "Landlord / manager", type: "text" },
  { key: "landlordPhone", label: "Landlord phone", type: "phone" },
  { key: "reasonForLeaving", label: "Reason for leaving", type: "text" },
  { key: "verified", label: "Verified with landlord", type: "switch" },
  { key: "landlordNotes", label: "Verification notes", type: "textarea" },
];

const REFERENCE_FIELDS = [
  { key: "name", label: "Name", type: "text", required: true },
  { key: "relationship", label: "Relationship", type: "select", options: toOptions(["Landlord", "Employer", "Personal", "Professional"]) },
  { key: "phone", label: "Phone", type: "phone" },
  { key: "email", label: "Email", type: "email" },
  { key: "status", label: "Status", type: "select", options: toOptions(["Not contacted", "Left message", "Verified", "Negative"]) },
  { key: "notes", label: "Notes", type: "textarea" },
];

const OccupantsSection = makeRecordItemsSection({
  kind: "occupant",
  fields: OCCUPANT_FIELDS,
  singular: "Occupant",
  plural: "Occupants",
  icon: Baby,
  emptyDescription: "Add people who will live in the unit but won't sign the lease.",
  summary: (o) => ({
    title: o.name,
    meta: [o.relationship, o.dateOfBirth ? `Born ${formatDate(o.dateOfBirth)}` : null].filter(Boolean).join(" · "),
    badge: o.minor ? "Minor" : null,
    badgeVariant: "neutral",
  }),
});

const HouseholdFields = makeFieldsSection(HOUSEHOLD_FIELDS);

// Household counts plus the occupant list.
function HouseholdSection(props) {
  return (
    <div className="space-y-6">
      <HouseholdFields {...props} />
      <OccupantsSection {...props} />
    </div>
  );
}

const applicationsConfig = {
  key: OWNER.application,
  singular: "Application",
  plural: "Applications",
  title: "Applications",
  description:
    "Review rental applications end to end — household, income against your criteria, recorded screening, fees, the decision, and conversion to a lease.",
  icon: ClipboardList,
  titleField: "name",
  searchFields: ["name", "email", "phone", "unit", "listingName"],
  data: applicationsLayer.data,
  rowsLoader: loadApplications,
  headerActions: () => <ScreeningCriteriaButton />,

  statusMap: APPLICATION_STATUS_MAP,
  statusFilterOptions: filterOptions(APPLICATION_STATUS_MAP),

  views: [
    { value: "review", label: "In review", filter: (r) => APP_IN_REVIEW.includes(r.status) },
    { value: "approved", label: "Approved", filter: (r) => ["Approved", "Conditionally approved"].includes(r.status) },
    { value: "converted", label: "Leased", filter: (r) => r.status === "Converted" },
    { value: "closed", label: "Closed", filter: (r) => APP_CLOSED.includes(r.status) },
    { value: "all", label: "All", filter: () => true },
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
      key: "screening",
      header: "Screening",
      className: "text-sm text-text-secondary tabular-nums",
      render: (r) => `${screeningProgress(r)}/${SCREENING_CHECKS.length}`,
    },
    {
      key: "ratio",
      header: "Income ÷ rent",
      className: "tabular-nums",
      render: (r) => {
        const x = listRatio(r);
        return x ? <Badge variant={x.pass ? "success" : "danger"}>{x.ratio.toFixed(1)}×</Badge> : <span className="text-text-tertiary">—</span>;
      },
    },
    {
      key: "feePaid",
      header: "Fee",
      render: (r) =>
        r.applicationFee ? (
          <Badge variant={r.feePaid ? "success" : "warning"}>{r.feePaid ? "Settled" : "Unpaid"}</Badge>
        ) : (
          <span className="text-text-tertiary">—</span>
        ),
    },
    {
      key: "appliedOn",
      header: "Applied",
      align: "right",
      className: "text-right text-sm text-muted-foreground",
      render: (r) => formatDate(r.appliedOn || r.createdAt),
    },
  ],

  stats: (rows) => {
    const approved = rows.filter((r) => APP_APPROVED.includes(r.status)).length;
    const denied = rows.filter((r) => r.status === "Denied").length;
    const turn = rows
      .map((r) => daysBetween(r.appliedOn || r.createdAt, r.metadata?.decidedOn))
      .filter((d) => d !== null);
    const f = ctxCache.funnel;
    return [
      { label: "In review", value: String(rows.filter((r) => APP_IN_REVIEW.includes(r.status)).length), footer: `${rows.length} total` },
      { label: "Approval rate", value: pct(approved, approved + denied), footer: `${approved} approved · ${denied} denied` },
      { label: "Avg days to decision", value: turn.length ? String(Math.round(turn.reduce((s, n) => s + n, 0) / turn.length)) : "—", footer: "Applied → decided" },
      { label: "Application → lease", value: f ? pct(f.leases, f.applications) : "—", footer: f ? `${f.leases} leases from ${f.applications} apps` : "Leasing funnel" },
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
    const [prospects, units] = await Promise.all([prospectContactOptions(), marketingUnitOptions()]);
    // Picking a prospect prefills the applicant's name and contact.
    const withContact = prospects.map((p) => ({
      ...p,
      patch: { name: p.patch.prospectName, email: p.patch.prospectContact.includes("@") ? p.patch.prospectContact : "" },
    }));
    return { prospects: withContact, units };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email?.trim() || "",
    phone: draft.phone?.trim() || "",
    prospectId: draft.prospectId || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    propertyName: draft.propertyName || "",
    appliedOn: todayISO(),
    occupants: 1,
    status: "Submitted",
  }),

  headerMeta: (r) => [r.unit, r.email, r.phone, r.appliedOn ? `Applied ${formatDate(r.appliedOn)}` : null].filter(Boolean).join(" · "),

  actions: (item) => [
    {
      key: "startScreening",
      label: "Start screening",
      icon: ShieldCheck,
      showIf: (i) => i.status === "Submitted",
      run: async (ctx) => {
        const state = screeningState(ctx.item);
        const next = Object.fromEntries(
          Object.entries(state).map(([k, s]) => [k, s.status === "Not started" ? { ...s, status: "Requested" } : s]),
        );
        if (!(await ctx.commit({ status: "Screening" }))) return;
        await ctx.commitMeta({ screening: next, screeningRequestedAt: new Date().toISOString() });
        ctx.log("Started screening (recorded manually — provider not connected)");
        toast.success("Screening started. Record each result as it comes back.");
        ctx.navigate("screening");
      },
    },
    {
      key: "decide",
      label: item.decision ? "Change decision" : "Record decision",
      icon: Gavel,
      showIf: (i) => !["Converted", "Withdrawn"].includes(i.status),
      wizard: {
        title: "Application decision",
        description: "Approve, approve with conditions, or deny with an adverse-action reason.",
        initial: (i) => ({
          outcome: i.status === "Denied" ? "deny" : i.status === "Conditionally approved" ? "conditional" : "approve",
          decidedBy: i.metadata?.decidedBy || "",
          decisionNotes: i.metadata?.decisionNotes || "",
          extraDeposit: i.metadata?.decisionConditions?.extraDeposit || "",
          cosignerRequired: Boolean(i.metadata?.decisionConditions?.cosignerRequired),
          rentAdjustment: i.metadata?.decisionConditions?.rentAdjustment || "",
          other: i.metadata?.decisionConditions?.other || "",
          reasons: i.metadata?.adverseAction?.reasons || [],
          noticeSentOn: i.metadata?.adverseAction?.noticeSentOn || todayISO(),
          reportUsed: Boolean(i.metadata?.adverseAction?.reportUsed),
          adverseNotes: i.metadata?.adverseAction?.notes || "",
        }),
        steps: [
          {
            key: "outcome",
            title: "Decision",
            fields: [
              {
                key: "outcome",
                label: "Decision",
                type: "select",
                required: true,
                options: [
                  { value: "approve", label: "Approve" },
                  { value: "conditional", label: "Approve with conditions" },
                  { value: "deny", label: "Deny" },
                ],
              },
              { key: "decidedBy", label: "Decided by", type: "text" },
              { key: "decisionNotes", label: "Notes", type: "textarea" },
            ],
          },
          {
            key: "conditions",
            title: "Conditions",
            showIf: (v) => v.outcome === "conditional",
            description: "What the applicant must accept to move forward.",
            fields: [
              { key: "extraDeposit", label: "Additional deposit", type: "currency" },
              { key: "cosignerRequired", label: "Cosigner / guarantor required", type: "switch" },
              { key: "rentAdjustment", label: "Rent adjustment (monthly)", type: "currency" },
              { key: "other", label: "Other conditions", type: "textarea" },
            ],
            validate: (v) =>
              !Number(v.extraDeposit) && !v.cosignerRequired && !Number(v.rentAdjustment) && !String(v.other || "").trim()
                ? "Add at least one condition."
                : null,
          },
          {
            key: "adverse",
            title: "Adverse action",
            showIf: (v) => v.outcome === "deny",
            description: "Record the reasons given in the adverse-action notice.",
            fields: [
              { key: "reasons", label: "Reasons", type: "multiselect", options: ADVERSE_ACTION_REASONS, required: true },
              { key: "noticeSentOn", label: "Notice sent on", type: "date" },
              { key: "reportUsed", label: "Consumer report used (bureau disclosed)", type: "switch" },
              { key: "adverseNotes", label: "Notes", type: "textarea" },
            ],
          },
        ],
        finishLabel: "Save decision",
        logSummary: "Recorded decision",
        finish: async (v, ctx) => {
          const status = v.outcome === "deny" ? "Denied" : v.outcome === "conditional" ? "Conditionally approved" : "Approved";
          const label = v.outcome === "deny" ? "Denied" : v.outcome === "conditional" ? "Approved with conditions" : "Approved";
          if (!(await ctx.commit({ status, decision: label }))) return false;
          await ctx.commitMeta({
            decidedOn: todayISO(),
            decidedBy: v.decidedBy || "",
            decisionNotes: v.decisionNotes || "",
            decisionConditions:
              v.outcome === "conditional"
                ? { extraDeposit: Number(v.extraDeposit) || 0, cosignerRequired: Boolean(v.cosignerRequired), rentAdjustment: Number(v.rentAdjustment) || 0, other: v.other || "" }
                : null,
            adverseAction:
              v.outcome === "deny"
                ? { reasons: v.reasons || [], noticeSentOn: v.noticeSentOn || "", reportUsed: Boolean(v.reportUsed), notes: v.adverseNotes || "" }
                : null,
          });
          if (ctx.item.prospectId) logSystemActivity(OWNER.prospect, ctx.item.prospectId, "action", `Application ${label.toLowerCase()}`);
          toast.success(`Application ${label.toLowerCase()}.`);
          ctx.navigate("decision");
          return true;
        },
      },
    },
    {
      key: "convertLease",
      label: "Convert to lease",
      icon: UserCheck,
      showIf: (i) => ["Approved", "Conditionally approved"].includes(i.status) && !i.leaseId,
      wizard: {
        title: "Convert to lease",
        description:
          "Creates the tenant and the lease, adds the applicant and co-applicants as lease parties, marks the prospect converted and any waitlist entry placed.",
        initial: (i) => ({
          leaseName: `${i.unit || "Unit"} — ${i.name || "Applicant"}`,
          termStart: i.moveInDate || todayISO(),
          termMonths: "12",
          termEnd: "",
          rent: "",
          deposit: "",
          leaseStatus: "Draft",
        }),
        steps: [
          {
            key: "terms",
            title: "Terms",
            fields: [
              { key: "leaseName", label: "Lease name", type: "text", required: true, full: true },
              { key: "termStart", label: "Start date", type: "date", required: true },
              { key: "termMonths", label: "Term", type: "select", options: ["6", "9", "12", "18", "24"].map((m) => ({ value: m, label: `${m} months` })) },
              { key: "termEnd", label: "End date", type: "date", hint: "Blank = start + term." },
              { key: "rent", label: "Monthly rent", type: "currency", hint: "Blank = the unit's rent (plus any rent adjustment)." },
              { key: "deposit", label: "Security deposit", type: "currency", hint: "Blank = fees policy default plus any extra-deposit condition." },
              { key: "leaseStatus", label: "Lease status", type: "select", options: toOptions(["Draft", "Pending", "Active"]) },
            ],
          },
          {
            key: "review",
            title: "Review",
            render: ({ values }) => (
              <div className="space-y-2 rounded-xl border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
                <p>
                  <span className="font-medium text-foreground">{values.leaseName}</span> · starts {formatDate(values.termStart)} ·{" "}
                  {values.termEnd ? `ends ${formatDate(values.termEnd)}` : `${values.termMonths} months`}
                </p>
                <p>Rent {values.rent ? currency(values.rent) : "from the unit"} · deposit {values.deposit ? currency(values.deposit) : "from policy"}</p>
                <p>The applicant becomes the primary tenant; co-applicants, cosigners and occupants are added with their roles.</p>
              </div>
            ),
          },
        ],
        finishLabel: "Create lease",
        logSummary: "Converted to lease",
        finish: async (v, ctx) => {
          const app = ctx.item;
          const conditions = app.metadata?.decisionConditions || null;
          const baseRent = v.rent !== "" && v.rent !== undefined ? Number(v.rent) : await applicationRent(app);
          const rent = baseRent + (v.rent === "" ? Number(conditions?.rentAdjustment) || 0 : 0);
          const deposit = v.deposit !== "" && v.deposit !== undefined ? Number(v.deposit) : await defaultDeposit(app, rent);
          const res = await convertApplicationToLease(app, {
            ...v,
            rent,
            deposit,
            termEnd: v.termEnd || termEndISO(v.termStart, v.termMonths),
            conditions,
          });
          if (!res.ok) {
            toast.error(res.error || "Couldn't convert the application.");
            return false;
          }
          if (res.warnings.length) toast.error(res.warnings[0]);
          toast.success("Lease created — tenant, lease and parties are ready.");
          ctx.reload();
          return true;
        },
      },
    },
    {
      key: "withdraw",
      label: "Mark withdrawn",
      icon: Undo2,
      separatorBefore: true,
      showIf: (i) => ![...APP_CLOSED, "Converted"].includes(i.status),
      run: async (ctx) => {
        if (await ctx.commit({ status: "Withdrawn" })) {
          await ctx.commitMeta({ withdrawnOn: todayISO() });
          toast.success("Application withdrawn.");
        }
      },
    },
    {
      key: "reopen",
      label: "Reopen",
      icon: RotateCcw,
      showIf: (i) => APP_CLOSED.includes(i.status),
      run: async (ctx) => {
        if (await ctx.commit({ status: "Submitted", decision: "" })) toast.success("Application reopened.");
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Applicant, qualification and screening at a glance." }],
    },
    {
      group: "Applicant",
      items: [
        { key: "applicant", label: "Applicant", icon: Contact, desc: "Identity, contact and disclosures." },
        { key: "unit", label: "Unit & listing", icon: Home, desc: "What they applied for and when." },
        { key: "coApplicants", label: "Co-applicants", icon: Users, desc: "Co-applicants, cosigners and guarantors." },
        { key: "household", label: "Household", icon: Baby, desc: "Occupants who will live in the unit." },
        { key: "pets", label: "Pets", icon: PawPrint, desc: "Pets and assistance animals." },
        { key: "vehicles", label: "Vehicles", icon: Car, desc: "Vehicles for parking." },
      ],
    },
    {
      group: "Qualification",
      items: [
        { key: "income", label: "Employment & income", icon: Wallet, desc: "Income against the rent and your criteria." },
        { key: "history", label: "Rental history", icon: History, desc: "Current and previous residences." },
        { key: "references", label: "References", icon: BookUser, desc: "Landlord, employer and personal references." },
        { key: "screening", label: "Screening", icon: ShieldCheck, desc: "Background, credit, eviction and income checks (recorded)." },
      ],
    },
    {
      group: "Decision",
      items: [
        { key: "fees", label: "Fees", icon: Receipt, desc: "Application fees paid, waived or refunded." },
        { key: "decision", label: "Decision & lease", icon: Gavel, desc: "Approve, condition or deny — then convert to a lease." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "IDs, pay stubs, reports and notices." },
        { key: "custom", label: "Custom Fields", icon: Tags, desc: "Fields defined in Settings → Custom Fields." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes, screening updates and decisions." },
      ],
    },
  ],
  sections: {
    overview: ApplicationOverviewSection,
    applicant: makeFieldsSection(APPLICANT_FIELDS),
    unit: makeFieldsSection(UNIT_FIELDS),
    coApplicants: makeRecordItemsSection({
      kind: "co_applicant",
      fields: CO_APPLICANT_FIELDS,
      singular: "Co-applicant",
      plural: "Co-applicants",
      icon: Users,
      defaults: () => ({ role: "tenant", status: "Not started" }),
      emptyDescription: "Add everyone who will sign the lease or guarantee it. They become lease parties on conversion.",
      summary: (c) => ({
        title: c.name,
        meta: [PARTY_ROLE_OPTIONS.find((o) => o.value === c.role)?.label, c.relationship, c.email].filter(Boolean).join(" · "),
        badge: c.status || "Not started",
        badgeVariant: c.status === "Complete" ? "success" : c.status === "Failed" ? "danger" : "neutral",
        aside: c.amount ? `${currency(c.amount)}/mo` : null,
      }),
    }),
    household: HouseholdSection,
    pets: makeRecordItemsSection({
      kind: "pet",
      fields: PET_FIELDS,
      singular: "Pet",
      plural: "Pets",
      icon: PawPrint,
      summary: (p) => ({
        title: p.name,
        meta: [p.petType, p.breed, p.weightLbs ? `${p.weightLbs} lbs` : null].filter(Boolean).join(" · "),
        badge: p.assistanceAnimal ? "Assistance animal" : null,
        badgeVariant: "info",
      }),
    }),
    vehicles: makeRecordItemsSection({
      kind: "vehicle",
      fields: VEHICLE_FIELDS,
      singular: "Vehicle",
      plural: "Vehicles",
      icon: Car,
      summary: (v) => ({ title: v.name, meta: [v.year, v.color, [v.plate, v.plateState].filter(Boolean).join(" ")].filter(Boolean).join(" · ") }),
    }),
    income: IncomeSection,
    history: makeRecordItemsSection({
      kind: "residence",
      fields: RESIDENCE_FIELDS,
      singular: "Residence",
      plural: "Residences",
      icon: History,
      defaults: () => ({ status: "Current", ownership: "Rent" }),
      summary: (r) => ({
        title: r.name,
        meta: [r.landlordName, [formatDate(r.startsOn), r.endsOn ? formatDate(r.endsOn) : "present"].join(" – "), r.reasonForLeaving].filter(Boolean).join(" · "),
        badge: r.verified ? "Verified" : r.status || "Current",
        badgeVariant: r.verified ? "success" : "neutral",
        aside: r.amount ? `${currency(r.amount)}/mo` : null,
      }),
    }),
    references: makeRecordItemsSection({
      kind: "reference",
      fields: REFERENCE_FIELDS,
      singular: "Reference",
      plural: "References",
      icon: BookUser,
      defaults: () => ({ status: "Not contacted" }),
      summary: (r) => ({
        title: r.name,
        meta: [r.relationship, r.phone, r.email].filter(Boolean).join(" · "),
        badge: r.status || "Not contacted",
        badgeVariant: r.status === "Verified" ? "success" : r.status === "Negative" ? "danger" : "neutral",
      }),
    }),
    screening: ScreeningSection,
    fees: FeesSection,
    decision: DecisionSection,
    documents: DocumentsSection,
    custom: makeCustomFieldsSection("applications"),
    notes: makeNotesSection({ field: "notes", placeholder: "Internal notes on this application…" }),
    activity: ActivitySection,
  },
};

export function ApplicationsScreen() {
  return <EntityListScreen config={applicationsConfig} />;
}

export default ApplicationsScreen;
