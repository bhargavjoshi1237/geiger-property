import {
  LayoutDashboard,
  SquarePen,
  FileSignature,
  Wallet,
  UsersRound,
  FileText,
  MessagesSquare,
  Smartphone,
  ShieldCheck,
  Users,
  LifeBuoy,
  IdCard,
  Briefcase,
  Car,
  Sliders,
  PawPrint,
  Contact,
  Bell,
  Ban,
  TrendingUp,
  Umbrella,
  Gavel,
  ClipboardList,
  Clock,
  StickyNote,
  LogOut,
  Baby,
  BookOpen,
  CreditCard,
} from "lucide-react";
import { collectPaymentAction, makeOnlinePaymentsSection } from "@/components/internal/screens/payments";
import { makeLedgerSection } from "@/components/internal/screens/accounting/ledger_section";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { listTenants, tenantsData } from "@/lib/supabase/tenants";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import { leasesLayer } from "@/lib/supabase/leases";
import { complianceByOwner } from "@/lib/supabase/compliance";
import { unitOptions } from "@/lib/supabase/options";
import { COMPLIANCE_STATUS_MAP, complianceOf, daysUntil, expiryBadge } from "@/lib/compliance";
import { balanceOf } from "@/components/internal/screens/accounting/shared";
import {
  makeFieldsSection,
  makeNotesSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { ActivitySection } from "@/components/internal/screens/entity/shared_sections/activity_section";
import { makeLoadedFieldsSection } from "@/components/internal/screens/people/loaded_fields";
import { PORTAL_STATUS_MAP } from "@/components/internal/screens/people/shared";
import {
  TENANT_STATUS_MAP,
  TENANT_STATUS_FILTER_OPTIONS,
  RESIDENT_STATUSES,
  currency,
  formatDate,
  insuranceRequired,
  portalStatusOf,
  TENANT_PROFILE_FIELDS,
  TENANT_COMMUNICATION_FIELDS,
  TENANT_PAYMENT_FIELDS,
  TENANT_SCREENING_FIELDS,
  TENANT_IDENTITY_FIELDS,
  TENANT_EMPLOYMENT_FIELDS,
  TENANT_MOVE_OUT_FIELDS,
  CONTACT_FIELDS,
  OCCUPANT_FIELDS,
  EMERGENCY_FIELDS,
  PET_FIELDS,
  VEHICLE_FIELDS,
} from "./shared";
import { tenantActions } from "./actions";
import { TenantOverviewSection } from "./sections/overview";
import { PaymentRestrictionsSection } from "./sections/payment_restrictions";
import { TenantPortalSection } from "./sections/portal";
import { TenantInsuranceSection, TenantRentReportingSection } from "./sections/insurance";
import { TenantCommunicationsSection } from "./sections/communications";
import { TenantDocumentsSection } from "./sections/documents";
import { TenantLeasesSection, TenantViolationsSection, TenantWorkOrdersSection } from "./sections/related";

// Per-area config for the one Tenants screen (row = a resident or applicant):
// profile, household, compliance, money flags, related records, and portal.
// Balance is derived from Rent Collection; ledgers are owned by Accounting.

// Unit picker: tenants store unit + property id (property name is not a column).
const tenantUnitOptions = async () =>
  ((await unitOptions()) ?? []).map((o) => ({
    value: o.value,
    label: o.label,
    patch: { unit: o.patch.unit, propertyId: o.patch.propertyId },
  }));

// Lease picker: linking a lease also fills its term dates (when the lease has them).
const tenantLeaseOptions = async () =>
  ((await leasesLayer.list()) ?? []).map((l) => ({
    value: l.id,
    label: [l.name || "Lease", l.unit].filter(Boolean).join(" · "),
    patch: {
      ...(l.termStart ? { leaseStart: l.termStart } : {}),
      ...(l.termEnd ? { leaseEnd: l.termEnd } : {}),
    },
  }));

// Join balances (rent accounts, by id else name) and renters-insurance compliance.
async function loadTenants() {
  const [tenants, accounts, policies] = await Promise.all([
    listTenants(),
    rentAccountsLayer.list(),
    complianceByOwner("tenant", "insurance_policy"),
  ]);
  const accts = accounts ?? [];
  return (tenants ?? []).map((t) => {
    const mine = accts.filter((a) =>
      a.tenantId ? a.tenantId === t.id : Boolean(a.tenantName) && a.tenantName === t.name,
    );
    const insurance = complianceOf(policies.get(t.id) || [], { required: insuranceRequired(t) });
    return {
      ...t,
      balance: mine.reduce((s, a) => s + balanceOf(a), 0),
      insuranceState: insurance.state,
      insuranceExpires: insurance.soonest,
    };
  });
}

const TENANT_LEASE_FIELDS = [
  { key: "unitId", label: "Unit", type: "relation", load: tenantUnitOptions, displayKey: "unit" },
  { key: "leaseId", label: "Current lease", type: "relation", load: tenantLeaseOptions },
  { key: "leaseStart", label: "Lease start", type: "date" },
  { key: "leaseEnd", label: "Lease end", type: "date" },
  { key: "moveInDate", label: "Move-in date", type: "date", meta: true },
  { key: "propertyName", label: "Property", type: "text", meta: true, placeholder: "e.g. Maple Court" },
  { key: "rentAmount", label: "Monthly rent", type: "currency", meta: true },
  { key: "rentDueDay", label: "Rent due day", type: "number", meta: true, min: 1, max: 31 },
  {
    key: "rentPeriod",
    label: "Rent period",
    type: "select",
    meta: true,
    options: [
      { value: "Monthly", label: "Monthly" },
      { value: "Weekly", label: "Weekly" },
      { value: "Daily", label: "Daily" },
    ],
  },
  { key: "leasingAgent", label: "Leasing agent", type: "text", meta: true },
  { key: "subsidized", label: "Housing assistance / subsidy", type: "switch", meta: true },
  { key: "subsidyProgram", label: "Program", type: "text", meta: true, placeholder: "e.g. Section 8 HCV", showIf: (i) => Boolean(i?.metadata?.subsidized) },
  { key: "subsidyAmount", label: "Subsidy (monthly)", type: "currency", meta: true, showIf: (i) => Boolean(i?.metadata?.subsidized) },
];

const relationMeta = (r) => [r.relation, r.email, r.phone].filter(Boolean).join(" · ");

const isCurrent = (r) => RESIDENT_STATUSES.includes(r.status);
const insuranceGap = (r) => isCurrent(r) && ["missing", "expired"].includes(r.insuranceState);

export const tenantsConfig = {
  key: "tenant",
  singular: "Tenant",
  plural: "Tenants",
  title: "Tenants",
  description:
    "Every resident and applicant across your portfolio. Open a tenant to manage their household, leases, compliance, payment rules, and portal access.",
  icon: Users,
  titleField: "name",
  searchFields: ["name", "email", "phone", "unit"],
  data: tenantsData,
  rowsLoader: loadTenants,

  statusMap: TENANT_STATUS_MAP,
  statusFilterOptions: TENANT_STATUS_FILTER_OPTIONS,

  views: [
    { value: "all", label: "All" },
    { value: "current", label: "Current", filter: isCurrent },
    { value: "applicants", label: "Applicants", filter: (r) => r.status === "Applicant" || r.status === "Future", createDefaults: { status: "Applicant" } },
    { value: "insurance", label: "Insurance gaps", filter: (r) => insuranceGap(r) || (isCurrent(r) && r.insuranceState === "expiring") },
    { value: "past", label: "Past", filter: (r) => r.status === "Past" },
  ],

  columns: [
    {
      key: "name",
      header: "Tenant",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{r.email || r.phone || "No contact info"}</span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={TENANT_STATUS_MAP} /> },
    { key: "unit", header: "Unit", render: (r) => <span className="text-sm text-muted-foreground">{r.unit || "—"}</span> },
    {
      key: "leaseEnd",
      header: "Lease end",
      render: (r) => {
        const d = daysUntil(r.leaseEnd);
        const soon = d !== null && d >= 0 && d <= 60 && isCurrent(r);
        return (
          <span className={soon ? "text-sm text-amber-700 dark:text-amber-400" : "text-sm text-muted-foreground"}>
            {formatDate(r.leaseEnd)}
            {soon ? ` · ${d}d` : ""}
          </span>
        );
      },
    },
    {
      key: "insuranceState",
      header: "Insurance",
      render: (r) =>
        r.insuranceState === "not_required" ? (
          <span className="text-sm text-text-tertiary">—</span>
        ) : (
          <StatusPill status={r.insuranceState} map={COMPLIANCE_STATUS_MAP} />
        ),
    },
    {
      key: "portal",
      header: "Portal",
      render: (r) => <StatusPill status={portalStatusOf(r)} map={PORTAL_STATUS_MAP} />,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (
        <span className={Number(r.balance) > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}>
          {currency(r.balance)}
        </span>
      ),
    },
  ],

  stats: (rows) => {
    const current = rows.filter(isCurrent);
    const gaps = current.filter(insuranceGap).length;
    const expiring = current.filter((r) => r.insuranceState === "expiring").length;
    const owing = rows.filter((r) => Number(r.balance) > 0);
    const owed = owing.reduce((s, r) => s + Number(r.balance), 0);
    const onPortal = current.filter((r) => r.portalEnabled).length;
    return [
      { label: "Current tenants", value: String(current.length), footer: `${rows.filter((r) => r.status === "Applicant").length} applicants` },
      { label: "Balance due", value: currency(owed), footer: `${owing.length} with a balance` },
      { label: "Missing insurance", value: String(gaps), footer: `${expiring} expiring ≤30 days` },
      {
        label: "On the portal",
        value: current.length ? `${Math.round((onPortal / current.length) * 100)}%` : "0%",
        footer: `${onPortal} of ${current.length} current`,
      },
    ];
  },

  createDraft: { name: "", email: "", unitId: "", status: "Applicant" },
  createFields: [
    { key: "name", label: "Full name", type: "text", placeholder: "e.g. Jordan Blake" },
    { key: "email", label: "Email", type: "text", placeholder: "name@example.com" },
    { key: "unitId", label: "Unit", type: "select", optionsFrom: "units", emptyLabel: "No units yet" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: ["Applicant", "Future", "Current", "Past"].map((v) => ({ value: v, label: TENANT_STATUS_MAP[v].label })),
    },
  ],
  loadCreateOptions: async () => ({ units: await unitOptions() }),
  newRow: (draft) => {
    const [first, ...rest] = draft.name.trim().split(/\s+/);
    return {
      name: draft.name.trim(),
      email: draft.email || "",
      unitId: draft.unitId || "",
      unit: draft.unit || "",
      propertyId: draft.propertyId || "",
      status: draft.status || "Applicant",
      balance: 0,
      metadata: {
        firstName: first || "",
        lastName: rest.join(" "),
        tenantType: "Individual",
        emailOptIn: true,
        portalStatus: "Not invited",
        ...(draft.propertyName ? { propertyName: draft.propertyName } : {}),
      },
    };
  },

  headerMeta: (r) => [r.metadata?.preferredName ? `“${r.metadata.preferredName}”` : null, r.email, r.unit].filter(Boolean).join(" · "),

  actions: (item) => [...tenantActions, collectPaymentAction(item, { tenantIdOf: (i) => i.id, separatorBefore: true })],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this tenant and anything needing attention." }],
    },
    {
      group: "Profile",
      items: [
        { key: "profile", label: "Profile", icon: SquarePen, desc: "Name, contact details, and personal information." },
        { key: "communication", label: "Communication Preferences", icon: Bell, desc: "Channels, consents, and delivery preferences." },
        { key: "employment", label: "Employment & Income", icon: Briefcase, desc: "Employer, role, and income." },
        { key: "identification", label: "Identification", icon: IdCard, desc: "ID type and last four digits only." },
        { key: "screening", label: "Screening", icon: ShieldCheck, desc: "Recorded credit, background, and eviction checks." },
      ],
    },
    {
      group: "Household",
      items: [
        { key: "contacts", label: "Household Contacts", icon: Contact, desc: "Everyone on the account and who gets notices and statements." },
        { key: "occupants", label: "Occupants", icon: Baby, desc: "Other people living in the unit." },
        { key: "emergency", label: "Emergency Contacts", icon: LifeBuoy, desc: "Who to reach in an emergency, in call order." },
        { key: "pets", label: "Pets", icon: PawPrint, desc: "Pets and assistance animals, with vaccination expiry." },
        { key: "vehicles", label: "Vehicles", icon: Car, desc: "Registered vehicles, parking, and permits." },
      ],
    },
    {
      group: "Leasing & Money",
      items: [
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Charges, payments and credits with a running balance." },
        { key: "onlinePayments", label: "Online Payments", icon: CreditCard, desc: "Card and ACH payments, payment links and autopay." },
        { key: "lease", label: "Lease & Unit", icon: FileSignature, desc: "Current unit and lease, term, rent, and subsidy." },
        { key: "leases", label: "Leases", icon: UsersRound, desc: "Every lease this person is on, and their role." },
        { key: "payments", label: "Payments & Balance", icon: Wallet, desc: "Balance, autopay, and payment preferences." },
        { key: "restrictions", label: "Payment Restrictions", icon: Ban, desc: "Blocked payment methods, why, and who set them." },
        { key: "rentReporting", label: "Rent Reporting", icon: TrendingUp, desc: "Credit-bureau rent reporting consent and enrollment." },
        { key: "moveOut", label: "Move-out", icon: LogOut, desc: "Move-out details and forwarding address.", showIf: (t) => t.status === "Past" || t.status === "Notice" },
      ],
    },
    {
      group: "Compliance & Operations",
      items: [
        { key: "insurance", label: "Renters Insurance", icon: Umbrella, desc: "Policies on file and compliance status." },
        { key: "violations", label: "Notices & Violations", icon: Gavel, desc: "Notices served to this tenant." },
        { key: "workOrders", label: "Work Orders", icon: ClipboardList, desc: "Maintenance requests and work orders." },
      ],
    },
    {
      group: "Portal & Messages",
      items: [
        { key: "portal", label: "Resident Portal", icon: Smartphone, desc: "Portal invite, access, and permissions." },
        { key: "notifications", label: "Notifications Log", icon: MessagesSquare, desc: "Emails, texts, calls, letters, and portal messages." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Leases, IDs, notices, and paperwork." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes on this tenant." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Private notes for your team." },
        { key: "customFields", label: "Custom Fields", icon: Sliders, desc: "Extra fields defined in Settings → Custom Fields." },
      ],
    },
  ],
  sections: {
    ledger: makeLedgerSection({ scope: "tenant" }),
    onlinePayments: makeOnlinePaymentsSection({ by: "tenant" }),
    overview: TenantOverviewSection,
    profile: makeFieldsSection(TENANT_PROFILE_FIELDS),
    communication: makeFieldsSection(TENANT_COMMUNICATION_FIELDS),
    employment: makeFieldsSection(TENANT_EMPLOYMENT_FIELDS),
    identification: makeLoadedFieldsSection(TENANT_IDENTITY_FIELDS),
    screening: makeFieldsSection(TENANT_SCREENING_FIELDS),
    contacts: makeRecordItemsSection({
      kind: "contact",
      fields: CONTACT_FIELDS,
      singular: "Contact",
      plural: "Contacts",
      icon: Contact,
      defaults: () => ({ receivesNotices: true, receivesStatements: false }),
      emptyDescription: "Add co-tenants, spouses, or family members who should hear from you.",
      summary: (r) => ({
        title: r.name,
        meta: [relationMeta(r), r.receivesNotices ? "Notices" : null, r.receivesStatements ? "Statements" : null].filter(Boolean).join(" · "),
        badge: r.isPrimary ? "Primary" : r.onLease ? "On lease" : undefined,
        badgeVariant: r.isPrimary ? "info" : "neutral",
      }),
    }),
    occupants: makeRecordItemsSection({
      kind: "occupant",
      fields: OCCUPANT_FIELDS,
      singular: "Occupant",
      plural: "Occupants",
      icon: Baby,
      emptyDescription: "Add anyone else living in the unit who isn't on the lease.",
      summary: (r) => ({
        title: r.name,
        meta: [r.relation, r.dateOfBirth ? `Born ${formatDate(r.dateOfBirth)}` : null].filter(Boolean).join(" · "),
        badge: r.isMinor ? "Minor" : undefined,
      }),
    }),
    emergency: makeRecordItemsSection({
      kind: "emergency_contact",
      fields: EMERGENCY_FIELDS,
      singular: "Emergency contact",
      plural: "Emergency contacts",
      icon: LifeBuoy,
      emptyDescription: "Add at least one person to call in an emergency.",
      summary: (r) => ({ title: r.name, meta: relationMeta(r), aside: Number(r.sort) ? `#${r.sort}` : undefined }),
    }),
    pets: makeRecordItemsSection({
      kind: "pet",
      fields: PET_FIELDS,
      singular: "Pet",
      plural: "Pets",
      icon: PawPrint,
      emptyDescription: "Record pets and assistance animals, with breed, weight, and vaccinations.",
      summary: (r) => {
        const vacc = r.endsOn ? expiryBadge(r) : null;
        const assist = r.assistance && r.assistance !== "None";
        return {
          title: [r.name, r.petType].filter(Boolean).join(" · "),
          meta: [r.breed, Number(r.weight) ? `${r.weight} lbs` : null, r.endsOn ? `Vaccines to ${formatDate(r.endsOn)}` : null]
            .filter(Boolean)
            .join(" · "),
          badge: vacc && vacc.state === "expired" ? "Vaccines expired" : assist ? r.assistance : vacc?.state === "expiring" ? vacc.label : undefined,
          badgeVariant: vacc?.state === "expired" ? "danger" : assist ? "purple" : "warning",
          aside: Number(r.amount) && !assist ? `${currency(r.amount)}/mo` : undefined,
        };
      },
    }),
    vehicles: makeRecordItemsSection({
      kind: "vehicle",
      fields: VEHICLE_FIELDS,
      singular: "Vehicle",
      plural: "Vehicles",
      icon: Car,
      emptyDescription: "Register vehicles for parking enforcement and permits.",
      summary: (r) => {
        const permit = r.endsOn ? expiryBadge(r) : null;
        return {
          title: [r.year, r.name, r.model].filter(Boolean).join(" "),
          meta: [r.color, r.plate ? `${r.plate}${r.plateState ? ` (${r.plateState})` : ""}` : null, r.parkingSpot ? `Spot ${r.parkingSpot}` : null]
            .filter(Boolean)
            .join(" · "),
          badge: permit && permit.state !== "active" ? `Permit: ${permit.label}` : r.permitNumber ? `Permit ${r.permitNumber}` : undefined,
          badgeVariant: permit?.state === "expired" ? "danger" : permit?.state === "expiring" ? "warning" : "neutral",
        };
      },
    }),
    lease: makeFieldsSection(TENANT_LEASE_FIELDS),
    leases: TenantLeasesSection,
    payments: makeFieldsSection(TENANT_PAYMENT_FIELDS),
    restrictions: PaymentRestrictionsSection,
    rentReporting: TenantRentReportingSection,
    moveOut: makeFieldsSection(TENANT_MOVE_OUT_FIELDS),
    insurance: TenantInsuranceSection,
    violations: TenantViolationsSection,
    workOrders: TenantWorkOrdersSection,
    portal: TenantPortalSection,
    notifications: TenantCommunicationsSection,
    documents: TenantDocumentsSection,
    activity: ActivitySection,
    notes: makeNotesSection({ field: "notes", placeholder: "Private notes about this tenant…" }),
    customFields: makeCustomFieldsSection("tenants"),
  },
};

export default tenantsConfig;
