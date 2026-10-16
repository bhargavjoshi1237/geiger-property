import {
  LayoutDashboard,
  FileSignature,
  Home,
  Wallet,
  Repeat,
  Gift,
  Receipt,
  Tag,
  PiggyBank,
  ShieldPlus,
  CreditCard,
  SlidersHorizontal,
  Users,
  PawPrint,
  Car,
  ShieldCheck,
  Plug,
  KeyRound,
  Wand2,
  Eye,
  ListChecks,
  FilePlus2,
  PenLine,
  LogIn,
  LogOut,
  Gavel,
  ShieldAlert,
  XCircle,
  FileText,
  StickyNote,
  Clock,
  Sliders,
  BookOpen,
} from "lucide-react";
import { collectPaymentAction, makeOnlinePaymentsSection } from "@/components/internal/screens/payments";
import { makeLedgerSection } from "@/components/internal/screens/accounting/ledger_section";

import { StatusPill } from "@/components/internal/shared/screen_kit";
import { leasesData } from "@/lib/supabase/leases";
import { listUnits } from "@/lib/supabase/units";
import { propertyOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeNotesSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makePolicySection } from "@/components/internal/screens/entity/sections/policy_section";
import { ActivitySection, DocumentsSection } from "@/components/internal/screens/entity/shared_sections";
import { LeaseOverviewSection } from "./sections/lease_overview";
import {
  RentSection,
  ChargesSection,
  BenefitsPackageSection,
  MoveInCostsSection,
  ConcessionsSection,
  DepositsSection,
  DepositAlternativeSection,
} from "./sections/lease_money";
import { PeopleSection, PetsSection, VehiclesSection } from "./sections/lease_people";
import { InsuranceSection, UtilitiesSection, AccessCodesSection } from "./sections/lease_terms";
import {
  LeaseDocumentSection,
  LeasePreviewSection,
  ClausesSection,
  AddendaSection,
  LeaseEsignSection,
  leaseTemplateOptions,
} from "./sections/lease_document";
import {
  MoveInSection,
  MoveOutSection,
  RenewalSection,
  NoticesSection,
  EvictionSection,
  TerminationSection,
} from "./sections/lease_lifecycle";
import { leaseActions } from "./lease_actions";
import {
  LEASE_STATUS_MAP,
  LEASE_TYPE_OPTIONS,
  TERM_TYPE_OPTIONS,
  filterOptions,
  currency,
  formatDate,
  daysUntil,
  withinDays,
  isLiveLease,
  toOptions,
} from "./shared";

// Per-area config for the Leases list + editor (row = a lease): terms, money,
// people, coverage, the agreement (template → document → e-sign tracking), and
// the lifecycle (move-in, renewal, notices, move-out, eviction, termination).

const term = (r) =>
  r.termType === "mtm"
    ? `Month-to-month since ${formatDate(r.metadata?.mtmSince || r.termStart)}`
    : r.termStart || r.termEnd
      ? `${formatDate(r.termStart)} – ${formatDate(r.termEnd)}`
      : "Term not set";

const endingSoon = (r) => isLiveLease(r) && r.termType !== "mtm" && withinDays(r.termEnd, 60);

// Unit options for the create dialog, carrying the unit's rent and deposit into the draft.
async function unitOptionsWithRent() {
  const [opts, units] = await Promise.all([unitOptions(), listUnits()]);
  const byId = new Map((units ?? []).map((u) => [u.id, u]));
  return opts.map((o) => {
    const u = byId.get(o.value);
    const rent = Number(u?.rent) || 0;
    return {
      ...o,
      label: rent ? `${o.label} — ${currency(rent)}` : o.label,
      patch: { ...o.patch, rent, deposit: Number(u?.deposit) || 0 },
    };
  });
}

const TERMS_FIELDS = [
  { key: "name", label: "Lease name", type: "text", required: true, full: true },
  { key: "status", label: "Status", type: "select", options: filterOptions(LEASE_STATUS_MAP).slice(1) },
  { key: "leaseType", label: "Lease type", type: "select", options: LEASE_TYPE_OPTIONS },
  { key: "termType", label: "Term", type: "select", options: TERM_TYPE_OPTIONS },
  { key: "termStart", label: "Term start", type: "date", required: true },
  { key: "termEnd", label: "Term end", type: "date", showIf: (i) => i.termType !== "mtm" },
  { key: "signedDate", label: "Signed on", type: "date" },
  { key: "moveInDate", label: "Move-in date", type: "date" },
  { key: "heading-rollover", label: "At term end", type: "heading", showIf: (i) => i.termType !== "mtm" },
  { key: "autoMtm", label: "Roll to month-to-month", type: "switch", meta: true, showIf: (i) => i.termType !== "mtm" },
  { key: "mtmPremium", label: "Month-to-month premium", type: "currency", meta: true, showIf: (i) => i.autoMtm || i.termType === "mtm" },
  { key: "noticeDays", label: "Notice required (days)", type: "number", meta: true, min: 0 },
  { key: "heading-commercial", label: "Commercial terms", type: "heading", showIf: (i) => i.leaseType === "commercial" },
  { key: "permittedUse", label: "Permitted use", type: "text", meta: true, full: true, showIf: (i) => i.leaseType === "commercial" },
  { key: "expenseStructure", label: "Expense structure", type: "select", meta: true, options: toOptions(["Gross", "Modified gross", "Single net (N)", "Double net (NN)", "Triple net (NNN)"]), showIf: (i) => i.leaseType === "commercial" },
  { key: "sqftLeased", label: "Square feet leased", type: "number", meta: true, showIf: (i) => i.leaseType === "commercial" },
  { key: "camCharges", label: "CAM charges / month", type: "currency", meta: true, showIf: (i) => i.leaseType === "commercial" },
  { key: "tiAllowance", label: "TI allowance", type: "currency", meta: true, showIf: (i) => i.leaseType === "commercial" },
  { key: "personalGuarantee", label: "Personal guarantee", type: "switch", meta: true, showIf: (i) => i.leaseType === "commercial" },
  { key: "heading-subsidy", label: "Housing assistance", type: "heading", showIf: (i) => i.leaseType !== "commercial" },
  { key: "subsidized", label: "Subsidized (e.g. Section 8)", type: "switch", meta: true, showIf: (i) => i.leaseType !== "commercial" },
  { key: "subsidyProgram", label: "Program / housing authority", type: "text", meta: true, showIf: (i) => i.subsidized },
  { key: "hapAmount", label: "Assistance portion / month", type: "currency", meta: true, showIf: (i) => i.subsidized },
  {
    key: "tenantPortion",
    label: "Tenant portion / month",
    type: "readonly",
    showIf: (i) => i.subsidized,
    format: (_v, i) => currency(Math.max(0, (Number(i.rent) || 0) - (Number(i.metadata?.hapAmount ?? i.hapAmount) || 0))),
  },
];

const PREMISES_FIELDS = [
  { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
  { key: "propertyId", label: "Property", type: "relation", load: propertyOptions },
  { key: "address", label: "Premises address (override)", type: "text", meta: true, full: true, placeholder: "Leave blank to use the property address" },
  { key: "premises", label: "Premises description", type: "textarea", meta: true },
  { key: "furnished", label: "Furnished", type: "switch", meta: true },
  { key: "parkingSpaces", label: "Parking spaces", type: "text", meta: true, placeholder: "e.g. P-12, P-13" },
  { key: "storageUnit", label: "Storage unit", type: "text", meta: true },
  { key: "mailboxNumber", label: "Mailbox #", type: "text", meta: true },
  {
    key: "appliances",
    label: "Appliances included",
    type: "multiselect",
    meta: true,
    options: toOptions(["Refrigerator", "Range / oven", "Dishwasher", "Microwave", "Washer", "Dryer", "Disposal", "Window AC"]),
  },
];

export const leasingConfig = {
  key: "lease",
  singular: "Lease",
  plural: "Leases",
  title: "Leases",
  description:
    "Every lease across your portfolio — draft, active, and ending. Build agreements from templates, track signatures, and run renewals, move-outs, and evictions.",
  icon: FileSignature,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: leasesData,

  statusMap: LEASE_STATUS_MAP,
  statusFilterOptions: filterOptions(LEASE_STATUS_MAP),

  views: [
    { value: "all", label: "All", filter: () => true },
    { value: "active", label: "In force", filter: isLiveLease },
    { value: "drafts", label: "Drafts", filter: (r) => r.status === "Draft" || r.status === "Pending", createDefaults: { status: "Draft" } },
    { value: "ending", label: "Ending soon", filter: endingSoon },
    { value: "moving", label: "Notice & move-out", filter: (r) => r.status === "Notice given" || Boolean(r.moveOutDate && isLiveLease(r)) },
    { value: "mtm", label: "Month-to-month", filter: (r) => r.termType === "mtm" || r.status === "Month-to-month" },
    { value: "closed", label: "Closed", filter: (r) => ["Ended", "Renewed", "Terminated"].includes(r.status) },
  ],

  columns: [
    {
      key: "name",
      header: "Lease",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">{term(r)}</span>
        </div>
      ),
    },
    {
      key: "tenantName",
      header: "Tenant · Unit",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm text-foreground">{r.tenantName || "—"}</span>
          <span className="text-xs text-text-secondary">{r.unit || "No unit linked"}</span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={LEASE_STATUS_MAP} />,
    },
    {
      key: "termEnd",
      header: "Ends",
      className: "text-sm text-muted-foreground",
      render: (r) => {
        if (r.status === "Notice given" && r.moveOutDate) {
          return <span className="text-orange-600 dark:text-orange-400">Moving out {formatDate(r.moveOutDate)}</span>;
        }
        if (r.termType === "mtm") return "Month-to-month";
        const d = daysUntil(r.termEnd);
        if (d === null) return "—";
        return (
          <span className={endingSoon(r) ? "text-amber-700 dark:text-amber-400" : undefined}>
            {formatDate(r.termEnd)}
            {endingSoon(r) ? ` · ${d}d` : ""}
          </span>
        );
      },
    },
    {
      key: "rent",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (
        <span>
          {currency(r.rent)}
          <span className="text-xs font-normal text-text-secondary">/mo</span>
        </span>
      ),
    },
  ],

  stats: (rows) => {
    const live = rows.filter(isLiveLease);
    const drafts = rows.filter((r) => r.status === "Draft" || r.status === "Pending").length;
    const ending = rows.filter(endingSoon).length;
    const notice = rows.filter((r) => r.status === "Notice given").length;
    const monthly = live.reduce((s, r) => s + (Number(r.rent) || 0), 0);
    return [
      { label: "Leases in force", value: String(live.length), footer: `${rows.length} total` },
      { label: "Monthly rent", value: currency(monthly), footer: "Leases in force" },
      { label: "In progress", value: String(drafts), footer: "Drafts and pending" },
      { label: "Ending ≤60 days", value: String(ending), footer: `${notice} on notice` },
    ];
  },

  createDraft: { name: "", unitId: "", tenantId: "", termStart: "", termEnd: "", templateId: "", status: "Draft" },
  createFields: [
    { key: "name", label: "Lease name", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    { key: "unitId", label: "Unit", type: "select", optionsFrom: "units", placeholder: "Select a unit…", emptyLabel: "No units yet — add them in Units" },
    { key: "tenantId", label: "Primary tenant", type: "select", optionsFrom: "tenants", placeholder: "Select a tenant…", emptyLabel: "No tenants yet — add them in Tenants" },
    { key: "termStart", label: "Term start", type: "date" },
    { key: "termEnd", label: "Term end", type: "date" },
    { key: "templateId", label: "Lease template", type: "select", optionsFrom: "templates", placeholder: "Optional", emptyLabel: "No templates yet — add them in Templates" },
    {
      key: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "Draft", label: "Draft" },
        { value: "Pending", label: "Pending" },
      ],
    },
  ],
  loadCreateOptions: async () => {
    const [units, tenants, templates] = await Promise.all([unitOptionsWithRent(), tenantOptions(), leaseTemplateOptions()]);
    return { units, tenants, templates };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    rent: Number(draft.rent) || 0,
    deposit: Number(draft.deposit) || 0,
    termStart: draft.termStart || "",
    termEnd: draft.termEnd || "",
    templateId: draft.templateId || "",
    leaseType: "residential",
    termType: "fixed",
    status: draft.status || "Draft",
  }),

  headerMeta: (r) =>
    [r.tenantName, r.unit, term(r), r.rent ? `${currency(r.rent)}/mo` : null].filter(Boolean).join(" · "),

  actions: (item) => [...leaseActions(item), collectPaymentAction(item, { leaseIdOf: (i) => i.id, separatorBefore: true })],

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Rent, term, people, and what's left to do." }],
    },
    {
      group: "General",
      items: [
        { key: "terms", label: "Terms", icon: FileSignature, desc: "Lease type, term, key dates, and rollover." },
        { key: "premises", label: "Unit & Premises", icon: Home, desc: "The unit, property, and what's included." },
      ],
    },
    {
      group: "Money",
      items: [
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Charges, payments and credits with a running balance." },
        { key: "onlinePayments", label: "Online Payments", icon: CreditCard, desc: "Card and ACH payments, payment links and autopay." },
        { key: "rent", label: "Rent & Escalations", icon: Wallet, desc: "Base rent and scheduled increases." },
        { key: "charges", label: "Recurring Charges", icon: Repeat, desc: "Pet rent, parking, storage, utilities, and more." },
        { key: "benefits", label: "Benefits Package", icon: Gift, desc: "Bundled resident services billed as one charge." },
        { key: "moveInCosts", label: "Move-in Costs", icon: Receipt, desc: "Prorated first month, deposits, and one-time fees." },
        { key: "concessions", label: "Concessions", icon: Tag, desc: "Specials and credits granted on this lease." },
        { key: "deposits", label: "Deposits", icon: PiggyBank, desc: "Deposit terms and deposits held." },
        { key: "depositAlternative", label: "Deposit Alternative", icon: ShieldPlus, desc: "Surety bond or deposit insurance." },
        { key: "payments", label: "Payment Settings", icon: CreditCard, desc: "Due day, late fees, and payment rules for this lease." },
        { key: "policies", label: "Lease Policies", icon: SlidersHorizontal, desc: "Pet, notice, rollover, and entry overrides." },
      ],
    },
    {
      group: "People",
      items: [
        { key: "people", label: "People", icon: Users, desc: "Tenants, co-signers, guarantors, and occupants." },
        { key: "pets", label: "Pets", icon: PawPrint, desc: "Pets allowed on this lease." },
        { key: "vehicles", label: "Vehicles & Parking", icon: Car, desc: "Vehicles and parking assignments." },
      ],
    },
    {
      group: "Coverage & access",
      items: [
        { key: "insurance", label: "Renters Insurance", icon: ShieldCheck, desc: "Requirement and policies on file." },
        { key: "utilities", label: "Utilities", icon: Plug, desc: "Who pays for each utility, and how." },
        { key: "access", label: "Access Codes", icon: KeyRound, desc: "Keypad, gate, and smart-lock codes with a valid window." },
      ],
    },
    {
      group: "Agreement",
      items: [
        { key: "document", label: "Template & Document", icon: Wand2, desc: "Pick a template and generate the lease document." },
        { key: "preview", label: "Preview", icon: Eye, desc: "The agreement merged with this lease's data." },
        { key: "clauses", label: "Clauses", icon: ListChecks, desc: "Additional terms, in the order they appear." },
        { key: "addenda", label: "Addenda", icon: FilePlus2, desc: "Addenda attached to this lease." },
        { key: "esign", label: "E-signature", icon: PenLine, desc: "Signing requests (tracked — no provider connected)." },
      ],
    },
    {
      group: "Lifecycle",
      items: [
        { key: "moveIn", label: "Move-in", icon: LogIn, desc: "Move-in checklist, record, and inspection." },
        { key: "renewal", label: "Renewal", icon: Repeat, desc: "Renewal settings, offers, and the renewal chain." },
        { key: "notices", label: "Notices & Violations", icon: ShieldAlert, desc: "Notices served or received on this lease." },
        { key: "moveOut", label: "Move-out", icon: LogOut, desc: "Notice, move-out, inspection, deposit, and turn." },
        {
          key: "eviction",
          label: "Eviction",
          icon: Gavel,
          desc: "Eviction case tracking.",
          showIf: (i) => Boolean(i.metadata?.evictionActive || i.metadata?.evictionStartedOn || i.status === "Eviction"),
        },
        {
          key: "termination",
          label: "Early Termination",
          icon: XCircle,
          desc: "Early termination terms and fee.",
          showIf: (i) => i.status === "Terminated" || Boolean(i.metadata?.earlyTermDate),
        },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Generated agreements, signed copies, and attachments." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Internal notes about this lease." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Every change and action on this lease." },
        { key: "custom", label: "Custom Fields", icon: Sliders, desc: "Fields defined in Settings → Custom Fields." },
      ],
    },
  ],
  sections: {
    ledger: makeLedgerSection({ scope: "lease" }),
    onlinePayments: makeOnlinePaymentsSection({ by: "lease" }),
    overview: LeaseOverviewSection,
    terms: makeFieldsSection(TERMS_FIELDS),
    premises: makeFieldsSection(PREMISES_FIELDS),
    rent: RentSection,
    charges: ChargesSection,
    benefits: BenefitsPackageSection,
    moveInCosts: MoveInCostsSection,
    concessions: ConcessionsSection,
    deposits: DepositsSection,
    depositAlternative: DepositAlternativeSection,
    payments: makePolicySection({ scope: "lease", groups: ["rent", "payments"] }),
    policies: makePolicySection({ scope: "lease", groups: ["leasing", "maintenance"] }),
    people: PeopleSection,
    pets: PetsSection,
    vehicles: VehiclesSection,
    insurance: InsuranceSection,
    utilities: UtilitiesSection,
    access: AccessCodesSection,
    document: LeaseDocumentSection,
    preview: LeasePreviewSection,
    clauses: ClausesSection,
    addenda: AddendaSection,
    esign: LeaseEsignSection,
    moveIn: MoveInSection,
    renewal: RenewalSection,
    notices: NoticesSection,
    moveOut: MoveOutSection,
    eviction: EvictionSection,
    termination: TerminationSection,
    documents: DocumentsSection,
    notes: makeNotesSection({ field: "notes", placeholder: "Internal notes about this lease…" }),
    activity: ActivitySection,
    custom: makeCustomFieldsSection("leases"),
  },
};

export default leasingConfig;
