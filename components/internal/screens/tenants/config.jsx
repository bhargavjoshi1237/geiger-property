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
  Settings,
  Users,
  LifeBuoy,
  IdCard,
  Briefcase,
  Car,
  Sliders,
} from "lucide-react";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { listTenants, tenantsData } from "@/lib/supabase/tenants";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import { leasesLayer } from "@/lib/supabase/leases";
import { unitOptions } from "@/lib/supabase/options";
import { balanceOf } from "@/components/internal/screens/accounting/shared";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  TENANT_STATUS_MAP,
  TENANT_STATUS_FILTER_OPTIONS,
  currency,
  formatDate,
  TENANT_CONTACT_FIELDS,
  TENANT_PAYMENT_FIELDS,
  TENANT_SCREENING_FIELDS,
  TENANT_EMERGENCY_FIELDS,
  TENANT_IDENTITY_FIELDS,
  TENANT_EMPLOYMENT_FIELDS,
  TENANT_VEHICLES_PETS_FIELDS,
} from "./shared";
import { DocumentsSection } from "./sections/documents";
import { ActivitySection } from "./sections/activity";
import { HouseholdSection } from "./sections/household";
import { ResidentPortalSection } from "./sections/resident_portal";

// Per-area config for the one Tenants screen (row = a resident or applicant).
// Merges the old Directory, Profiles, Households, Portal, and Documents pages
// into one editor; balance is derived from Rent Collection.

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

// Join each tenant's balance from their rent accounts (by id, else by name).
async function loadTenantsWithBalances() {
  const [tenants, accounts] = await Promise.all([listTenants(), rentAccountsLayer.list()]);
  const accts = accounts ?? [];
  return (tenants ?? []).map((t) => {
    const mine = accts.filter((a) =>
      a.tenantId ? a.tenantId === t.id : Boolean(a.tenantName) && a.tenantName === t.name,
    );
    return { ...t, balance: mine.reduce((s, a) => s + balanceOf(a), 0) };
  });
}

const TENANT_LEASE_FIELDS = [
  { key: "unitId", label: "Unit", type: "relation", load: tenantUnitOptions, displayKey: "unit" },
  { key: "leaseId", label: "Lease", type: "relation", load: tenantLeaseOptions },
  { key: "leaseStart", label: "Lease start", type: "date" },
  { key: "leaseEnd", label: "Lease end", type: "date" },
  { key: "propertyName", label: "Property", type: "text", meta: true, placeholder: "e.g. Maple Court" },
  { key: "rentAmount", label: "Monthly rent", type: "number", meta: true, placeholder: "0" },
];

const TENANT_SETTINGS_FIELDS = [
  {
    key: "preferredContact",
    label: "Preferred contact",
    type: "select",
    meta: true,
    options: [
      { value: "Email", label: "Email" },
      { value: "Phone", label: "Phone" },
      { value: "SMS", label: "SMS" },
    ],
  },
  { key: "language", label: "Language", type: "text", meta: true, placeholder: "e.g. English" },
  { key: "doNotContact", label: "Do not contact", type: "switch", meta: true },
];

const CURRENT_STATUSES = ["Current", "Late"];

export const tenantsConfig = {
  key: "tenant",
  singular: "Tenant",
  plural: "Tenants",
  title: "Tenants",
  description:
    "Every resident and applicant across your portfolio. Open a tenant to manage their lease, balance, household, documents, and portal access.",
  icon: Users,
  titleField: "name",
  searchFields: ["name", "email", "phone", "unit"],
  data: tenantsData,
  rowsLoader: loadTenantsWithBalances,

  statusMap: TENANT_STATUS_MAP,
  statusFilterOptions: TENANT_STATUS_FILTER_OPTIONS,

  views: [
    { value: "all", label: "All" },
    { value: "current", label: "Current", filter: (r) => CURRENT_STATUSES.includes(r.status) },
    { value: "applicants", label: "Applicants", filter: (r) => r.status === "Applicant" },
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
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={TENANT_STATUS_MAP} />,
    },
    {
      key: "unit",
      header: "Unit",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{r.unit || "—"}</span>
      ),
    },
    {
      key: "leaseEnd",
      header: "Lease end",
      render: (r) => (
        <span className="text-sm text-muted-foreground">{formatDate(r.leaseEnd)}</span>
      ),
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
    const current = rows.filter((r) => CURRENT_STATUSES.includes(r.status)).length;
    const applicants = rows.filter((r) => r.status === "Applicant").length;
    const owing = rows.filter((r) => Number(r.balance) > 0);
    const owed = owing.reduce((s, r) => s + Number(r.balance), 0);
    return [
      { label: "Tenants", value: String(rows.length), footer: `${current} current` },
      { label: "Current", value: String(current), footer: "Living in a unit" },
      { label: "Applicants", value: String(applicants), footer: "In screening" },
      { label: "Balance due", value: currency(owed), footer: `${owing.length} with a balance` },
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
      options: [
        { value: "Applicant", label: "Applicant" },
        { value: "Current", label: "Current" },
        { value: "Past", label: "Past" },
      ],
    },
  ],
  loadCreateOptions: async () => ({ units: await unitOptions() }),
  newRow: (draft) => ({
    name: draft.name.trim(),
    email: draft.email || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    status: draft.status || "Applicant",
    balance: 0,
    metadata: draft.propertyName ? { propertyName: draft.propertyName } : {},
  }),

  headerMeta: (r) => [r.email, r.unit].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this tenant — key details at a glance." },
      ],
    },
    {
      group: "General",
      items: [
        { key: "details", label: "Details", icon: SquarePen, desc: "Name, contact details, and status." },
        { key: "lease", label: "Lease & Unit", icon: FileSignature, desc: "Linked unit and lease, term, and rent." },
        { key: "payments", label: "Payments & Balance", icon: Wallet, desc: "Balance, autopay, and payment method." },
        { key: "emergency", label: "Emergency Contacts", icon: LifeBuoy, desc: "Who to reach in an emergency." },
        { key: "settings", label: "Settings", icon: Settings, desc: "Contact preferences for this tenant." },
      ],
    },
    {
      group: "Profile",
      items: [
        { key: "identity", label: "Identity", icon: IdCard, desc: "Date of birth, ID, and demographics." },
        { key: "employment", label: "Employment & Income", icon: Briefcase, desc: "Employer, role, and income." },
        { key: "vehiclesPets", label: "Vehicles & Pets", icon: Car, desc: "Registered vehicles and pets." },
        { key: "screening", label: "Screening & Background", icon: ShieldCheck, desc: "Recorded credit, background, and income checks." },
      ],
    },
    {
      group: "Relationships",
      items: [
        { key: "household", label: "Household & Occupants", icon: UsersRound, desc: "Group this tenant with co-residents." },
      ],
    },
    {
      group: "Records",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Leases, IDs, notices, and paperwork." },
        { key: "communication", label: "Communication Log", icon: MessagesSquare, desc: "Emails, calls, SMS, and notes." },
        { key: "customFields", label: "Custom Fields", icon: Sliders, desc: "Extra fields defined in Settings → Custom Fields." },
      ],
    },
    {
      group: "Portal",
      items: [
        { key: "portal", label: "Resident Portal", icon: Smartphone, desc: "Portal access for this resident." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "email", label: "Email" },
        { key: "phone", label: "Phone" },
        { key: "unit", label: "Unit" },
        { key: "status", label: "Status" },
        { key: "balance", label: "Balance", format: (v) => currency(v) },
        { key: "leaseStart", label: "Lease start", format: (v) => formatDate(v) },
        { key: "leaseEnd", label: "Lease end", format: (v) => formatDate(v) },
        { key: "propertyName", label: "Property", meta: true },
        { key: "emergencyName", label: "Emergency contact", meta: true },
        { key: "employer", label: "Employer", meta: true },
      ],
      note: "Balance is calculated from this tenant's rent accounts in Rent Collection.",
    }),
    details: makeFieldsSection(TENANT_CONTACT_FIELDS),
    lease: makeFieldsSection(TENANT_LEASE_FIELDS),
    payments: makeFieldsSection(TENANT_PAYMENT_FIELDS),
    emergency: makeFieldsSection(TENANT_EMERGENCY_FIELDS),
    settings: makeFieldsSection(TENANT_SETTINGS_FIELDS),
    identity: makeFieldsSection(TENANT_IDENTITY_FIELDS),
    employment: makeFieldsSection(TENANT_EMPLOYMENT_FIELDS),
    vehiclesPets: makeFieldsSection(TENANT_VEHICLES_PETS_FIELDS),
    screening: makeFieldsSection(TENANT_SCREENING_FIELDS),
    household: HouseholdSection,
    documents: DocumentsSection,
    communication: ActivitySection,
    customFields: makeCustomFieldsSection("tenants"),
    portal: ResidentPortalSection,
  },
};

export default tenantsConfig;
