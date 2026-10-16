import { toast } from "sonner";
import {
  LayoutDashboard,
  Building,
  Contact,
  Users,
  Wrench,
  DollarSign,
  Landmark,
  Receipt,
  ShieldCheck,
  Umbrella,
  BadgeCheck,
  Siren,
  Smartphone,
  ClipboardList,
  FileStack,
  Star,
  FileText,
  Clock,
  StickyNote,
  Sliders,
  Truck,
  ThumbsUp,
  ThumbsDown,
  FileCheck2,
  PauseCircle,
  PlayCircle,
  Ban,
  UserCheck,
  BookOpen,
} from "lucide-react";
import { makeLedgerSection } from "@/components/internal/screens/accounting/ledger_section";

import { Badge } from "@/components/ui/badge";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { vendorsLayer, vendorsData } from "@/lib/supabase/vendors";
import { announceInvite, disablePortalAccess, invitePortalAccess } from "@/lib/portal/staff_api";
import { listRecordItems, recordItemsLayer } from "@/lib/supabase/record_items";
import { complianceByOwner } from "@/lib/supabase/compliance";
import { COMPLIANCE_STATUS_MAP } from "@/lib/compliance";
import {
  makeFieldsSection,
  makeNotesSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { ActivitySection } from "@/components/internal/screens/entity/shared_sections/activity_section";
import { DocumentsSection } from "@/components/internal/screens/entity/shared_sections/documents_section";
import { makeLoadedFieldsSection } from "@/components/internal/screens/people/loaded_fields";
import { makeWorkOrdersSection, vendorBillsSection } from "@/components/internal/screens/people/related";
import { TIN_TYPE_OPTIONS, last4 } from "@/components/internal/screens/people/shared";
import {
  VENDOR_STATUS_MAP,
  TRADE_OPTIONS,
  VENDOR_COMPANY_FIELDS,
  VENDOR_CONTACT_FIELDS,
  VENDOR_TRADE_FIELDS,
  VENDOR_RATE_FIELDS,
  VENDOR_PAYMENT_FIELDS,
  VENDOR_TAX_FIELDS,
  VENDOR_AVAILABILITY_FIELDS,
  VENDOR_CONTACT_RECORD_FIELDS,
  COI_FIELDS,
  LICENSE_FIELDS,
  currency,
  filterOptions,
  formatDate,
  isPreferred,
  isUsable,
  needsW9,
  selectOptions,
  todayISO,
  tradesOf,
} from "./shared";
import {
  VendorCoiSection,
  VendorComplianceSection,
  VendorLicenseSection,
  VendorOverviewSection,
  VendorPortalSection,
  VendorReviewsSection,
  insuranceExpiryFrom,
  vendorCompliance,
} from "./sections";

// Vendors — the vendor directory (owns `property.vendors`): profile, trades,
// rates, payment and 1099 setup, compliance (COIs, licenses), and track record.

// Vendors joined with their COI + license compliance.
async function loadVendors() {
  const [vendors, cois, licenses] = await Promise.all([
    vendorsLayer.list(),
    complianceByOwner("vendor", "insurance_policy"),
    complianceByOwner("vendor", "license"),
  ]);
  return (vendors ?? []).map((v) => {
    const c = vendorCompliance(v, cois.get(v.id) || [], licenses.get(v.id) || []);
    return { ...v, complianceState: c.state, coiState: c.coi.state, coiExpires: c.coi.soonest, licenseState: c.license.state };
  });
}

// Wizard finisher that adds one compliance record of `kind` to the open vendor.
const addComplianceRecord = (kind, noun) => async (v, { item, commit, commitMeta, navigate }) => {
  const cols = {};
  const meta = {};
  for (const [k, val] of Object.entries(v)) {
    if (["name", "status", "startsOn", "endsOn", "amount"].includes(k)) cols[k] = val;
    else meta[k] = val;
  }
  const created = await recordItemsLayer.create({ id: crypto.randomUUID(), ownerType: "vendor", ownerId: item.id, kind, ...cols, metadata: meta });
  if (!created) {
    toast.error(`Couldn't add the ${noun}.`);
    return false;
  }
  // Keep the legacy insurance_expiry column on the soonest in-force certificate.
  if (kind === "insurance_policy") {
    const next = insuranceExpiryFrom((await listRecordItems("vendor", item.id, kind)) ?? [created]);
    if ((item.insuranceExpiry || "") !== next) await commit({ insuranceExpiry: next });
  }
  await commitMeta({ lastComplianceChangeAt: new Date().toISOString() });
  toast.success(`Added ${noun}.`);
  navigate(kind === "license" ? "licenses" : "insurance");
  return true;
};

const vendorActions = [
  {
    key: "invitePortal",
    label: "Invite to vendor portal",
    icon: Smartphone,
    showIf: (v) => v.metadata?.portalStatus !== "Active" || !v.metadata?.vendorPortalAccess,
    // Server creates the portal member, mirrors access onto the vendor, and emails the invite.
    run: async ({ item, reload }) => {
      const email = item.metadata?.portalInviteEmail || item.email;
      if (!email) {
        toast.error("Add an email for this vendor first.");
        return;
      }
      const res = await invitePortalAccess({ partyType: "vendor", partyId: item.id, email });
      if (announceInvite(res, email)) reload();
    },
  },
  {
    key: "disablePortal",
    label: "Disable vendor portal",
    icon: Ban,
    showIf: (v) => Boolean(v.metadata?.vendorPortalAccess),
    run: async ({ item, reload }) => {
      const res = await disablePortalAccess({ partyType: "vendor", partyId: item.id });
      if (!res.ok) {
        toast.error(res.error || "Couldn't disable portal access.");
        return;
      }
      toast.success("Vendor portal access disabled.");
      reload();
    },
  },
  {
    key: "addCoi",
    label: "Add insurance certificate",
    icon: Umbrella,
    wizard: {
      title: "Add insurance certificate",
      description: "Record a certificate of insurance (COI) from this vendor.",
      finishLabel: "Add certificate",
      logSummary: "Added an insurance certificate",
      initial: () => ({ status: "Active", policyType: "General liability", additionalInsured: true }),
      steps: [{ key: "coi", title: "Certificate", fields: COI_FIELDS }],
      finish: addComplianceRecord("insurance_policy", "certificate"),
    },
  },
  {
    key: "addLicense",
    label: "Add license",
    icon: BadgeCheck,
    wizard: {
      title: "Add license",
      description: "Record a trade or business license for this vendor.",
      finishLabel: "Add license",
      logSummary: "Added a license",
      initial: () => ({ status: "Active" }),
      steps: [{ key: "license", title: "License", fields: LICENSE_FIELDS }],
      finish: addComplianceRecord("license", "license"),
    },
  },
  {
    key: "recordW9",
    label: "Record W-9",
    icon: FileCheck2,
    wizard: {
      title: "Record W-9",
      description: "Store the taxpayer details from the W-9. Only the last four digits of the TIN are kept.",
      finishLabel: "Save W-9",
      logSummary: "Recorded W-9",
      initial: (v) => ({
        w9ReceivedOn: todayISO(),
        tinType: v.metadata?.tinType || "EIN",
        taxpayerName: v.metadata?.taxpayerName || v.name,
        tinLast4: v.metadata?.tinLast4 || "",
        is1099: v.metadata?.is1099 ?? true,
      }),
      steps: [
        {
          key: "w9",
          title: "W-9",
          fields: [
            { key: "w9ReceivedOn", label: "Received", type: "date", required: true },
            { key: "taxpayerName", label: "Taxpayer name", type: "text", required: true },
            { key: "tinType", label: "TIN type", type: "select", options: TIN_TYPE_OPTIONS },
            { key: "tinLast4", label: "TIN (last 4)", type: "text", required: true, placeholder: "1234" },
            { key: "is1099", label: "1099 eligible", type: "switch" },
          ],
          validate: (v) => (last4(v.tinLast4).length === 4 ? null : "Enter the last four digits of the TIN."),
        },
      ],
      finish: async (v, { commitMeta }) => {
        const ok = await commitMeta({
          w9OnFile: true,
          w9ReceivedOn: v.w9ReceivedOn,
          taxpayerName: v.taxpayerName,
          tinType: v.tinType,
          tinLast4: last4(v.tinLast4),
          is1099: Boolean(v.is1099),
        });
        if (ok) toast.success("W-9 recorded.");
        return ok;
      },
    },
  },
  {
    key: "markPreferred",
    label: "Mark as preferred",
    icon: ThumbsUp,
    showIf: (v) => !isPreferred(v) && isUsable(v),
    run: async ({ commitMeta, log }) => {
      if (!(await commitMeta({ preferred: true }))) return;
      log("Marked as preferred vendor");
      toast.success("Marked as preferred.");
    },
  },
  {
    key: "unmarkPreferred",
    label: "Remove preferred",
    icon: ThumbsDown,
    showIf: (v) => isPreferred(v),
    run: async ({ item, commit, commitMeta, log }) => {
      const ok = (await commitMeta({ preferred: false })) && (item.status === "Preferred" ? await commit({ status: "Active" }) : true);
      if (!ok) return;
      log("Removed preferred flag");
      toast.success("No longer preferred.");
    },
  },
  {
    key: "holdPayments",
    label: "Hold payments",
    icon: PauseCircle,
    showIf: (v) => !v.metadata?.holdPayments,
    wizard: {
      title: "Hold payments",
      description: "Bills for this vendor stay unpaid until you release the hold.",
      finishLabel: "Hold payments",
      logSummary: "Held vendor payments",
      steps: [
        {
          key: "hold",
          title: "Hold",
          fields: [{ key: "holdReason", label: "Reason", type: "text", required: true, full: true, placeholder: "e.g. Expired COI" }],
        },
      ],
      finish: async (v, { commitMeta }) => {
        const ok = await commitMeta({ holdPayments: true, holdReason: v.holdReason, holdSince: todayISO() });
        if (ok) toast.success("Payments on hold.");
        return ok;
      },
    },
  },
  {
    key: "releasePayments",
    label: "Release payments",
    icon: PlayCircle,
    showIf: (v) => Boolean(v.metadata?.holdPayments),
    run: async ({ commitMeta, log }) => {
      if (!(await commitMeta({ holdPayments: false, holdReason: "" }))) return;
      log("Released vendor payments");
      toast.success("Payments released.");
    },
  },
  {
    key: "doNotUse",
    label: "Mark do not use",
    icon: Ban,
    separatorBefore: true,
    showIf: (v) => v.status !== "Do not use",
    wizard: {
      title: "Mark do not use",
      description: "The vendor stays on file for history but is hidden from assignment pickers.",
      finishLabel: "Mark do not use",
      logSummary: "Marked do not use",
      steps: [
        { key: "reason", title: "Reason", fields: [{ key: "doNotUseReason", label: "Reason", type: "textarea", required: true }] },
      ],
      finish: async (v, { commit, commitMeta }) => {
        const ok = (await commit({ status: "Do not use" })) && (await commitMeta({ doNotUseReason: v.doNotUseReason, preferred: false }));
        if (ok) toast.success("Vendor marked do not use.");
        return ok;
      },
    },
  },
  {
    key: "reactivate",
    label: "Reactivate vendor",
    icon: UserCheck,
    separatorBefore: true,
    showIf: (v) => !isUsable(v),
    run: async ({ commit, commitMeta, log }) => {
      if (!(await commit({ status: "Active" }))) return;
      await commitMeta({ doNotUseReason: "" });
      log("Reactivated vendor");
      toast.success("Vendor reactivated.");
    },
  },
];

const attentionState = (r) => ["missing", "expired"].includes(r.complianceState);

export const vendorsConfig = {
  key: "vendor",
  singular: "Vendor",
  plural: "Vendors",
  title: "Vendors",
  description:
    "Your directory of contractors and service providers. Track trades, rates, insurance and licenses, 1099 details, and performance.",
  icon: Truck,
  titleField: "name",
  searchFields: ["name", "contactName", "specialty", "email", "phone"],
  data: vendorsData,
  rowsLoader: loadVendors,

  statusMap: VENDOR_STATUS_MAP,
  statusFilterOptions: filterOptions(VENDOR_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    { value: "preferred", label: "Preferred", filter: isPreferred },
    { value: "noncompliant", label: "Non-compliant", filter: (r) => isUsable(r) && attentionState(r) },
    { value: "expiring", label: "Expiring soon", filter: (r) => isUsable(r) && r.complianceState === "expiring" },
    { value: "emergency", label: "24/7", filter: (r) => Boolean(r.metadata?.emergencyAvailable) },
    { value: "inactive", label: "Inactive", filter: (r) => !isUsable(r) },
  ],

  columns: [
    {
      key: "name",
      header: "Vendor",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.contactName, r.phone].filter(Boolean).join(" · ") || "No contact set"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusPill status={r.status} map={VENDOR_STATUS_MAP} />
          {isPreferred(r) && r.status !== "Preferred" ? <Badge variant="purple">Preferred</Badge> : null}
        </span>
      ),
    },
    {
      key: "specialty",
      header: "Trades",
      render: (r) => {
        const trades = tradesOf(r);
        if (!trades.length) return <span className="text-text-tertiary">—</span>;
        return (
          <span className="inline-flex flex-wrap items-center gap-1">
            {trades.slice(0, 2).map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
            {trades.length > 2 ? <span className="text-xs text-text-secondary">+{trades.length - 2}</span> : null}
          </span>
        );
      },
    },
    {
      key: "complianceState",
      header: "Compliance",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <StatusPill status={r.complianceState} map={COMPLIANCE_STATUS_MAP} />
          {r.coiExpires ? <span className="text-xs text-text-secondary">COI to {formatDate(r.coiExpires)}</span> : null}
        </div>
      ),
    },
    {
      key: "hourlyRate",
      header: "Rate",
      render: (r) => <span className="text-sm text-muted-foreground">{Number(r.hourlyRate) ? `${currency(r.hourlyRate)}/hr` : "—"}</span>,
    },
    {
      key: "rating",
      header: "Rating",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => (Number(r.rating) ? `${Number(r.rating).toFixed(1)} ★` : "—"),
    },
  ],

  stats: (rows) => {
    const usable = rows.filter(isUsable);
    const expired = usable.filter((r) => r.coiState === "expired" || r.coiState === "missing").length;
    const expiring = usable.filter((r) => r.coiState === "expiring" || r.licenseState === "expiring").length;
    const rated = rows.filter((r) => Number(r.rating) > 0);
    const avg = rated.length ? (rated.reduce((s, r) => s + Number(r.rating), 0) / rated.length).toFixed(1) : "—";
    return [
      { label: "Active vendors", value: String(usable.length), footer: `${rows.filter(isPreferred).length} preferred` },
      { label: "Expired / missing COI", value: String(expired), footer: "Active vendors" },
      { label: "Expiring ≤30 days", value: String(expiring), footer: "COIs and licenses" },
      { label: "Avg rating", value: String(avg), footer: `${rows.filter(needsW9).length} missing W-9` },
    ];
  },

  createDraft: { name: "", specialty: "General contractor", status: "Active" },
  createFields: [
    { key: "name", label: "Vendor name", type: "text", placeholder: "e.g. Ace Mechanical" },
    { key: "specialty", label: "Primary trade", type: "select", options: TRADE_OPTIONS },
    { key: "status", label: "Status", type: "select", options: selectOptions(VENDOR_STATUS_MAP).filter((o) => o.value !== "Preferred") },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    specialty: draft.specialty || "",
    status: draft.status || "Active",
    metadata: { trades: draft.specialty ? [draft.specialty] : [], is1099: true, since: todayISO() },
  }),

  headerMeta: (r) => [tradesOf(r).slice(0, 3).join(", "), r.contactName, r.phone].filter(Boolean).join(" · "),

  actions: vendorActions,

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this vendor and anything needing attention." }],
    },
    {
      group: "Vendor",
      items: [
        { key: "company", label: "Company", icon: Building, desc: "Name, status, and preferred flag." },
        { key: "contact", label: "Contact", icon: Contact, desc: "Primary contact, dispatch, and address." },
        { key: "contacts", label: "Additional Contacts", icon: Users, desc: "Dispatchers, billing, and technicians." },
        { key: "trades", label: "Trades & Service Areas", icon: Wrench, desc: "What they do and where." },
        { key: "availability", label: "Availability", icon: Siren, desc: "Hours, response times, and emergency service." },
      ],
    },
    {
      group: "Money",
      items: [
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Bills and payments with a running payable balance." },
        { key: "rates", label: "Rates", icon: DollarSign, desc: "Hourly, trip charge, and multipliers." },
        { key: "payment", label: "Payment & Accounting", icon: Landmark, desc: "Terms, method, and default GL account." },
        { key: "tax", label: "Tax & 1099", icon: Receipt, desc: "1099 eligibility, TIN, and W-9." },
      ],
    },
    {
      group: "Compliance",
      items: [
        { key: "compliance", label: "Compliance Overview", icon: ShieldCheck, desc: "Overall status and requirements." },
        { key: "insurance", label: "Insurance (COI)", icon: Umbrella, desc: "Certificates of insurance on file." },
        { key: "licenses", label: "Licenses", icon: BadgeCheck, desc: "Trade and business licenses." },
      ],
    },
    {
      group: "Work",
      items: [
        { key: "workOrders", label: "Work Orders", icon: ClipboardList, desc: "Jobs assigned to this vendor." },
        { key: "bills", label: "Bills", icon: FileStack, desc: "Bills entered for this vendor." },
        { key: "reviews", label: "Ratings & Reviews", icon: Star, desc: "Job reviews and average rating." },
        { key: "portal", label: "Vendor Portal", icon: Smartphone, desc: "Portal access and permissions." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Contracts, W-9s, and certificates." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes on this vendor." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Private notes for your team." },
        { key: "customFields", label: "Custom Fields", icon: Sliders, desc: "Extra fields defined in Settings → Custom Fields." },
      ],
    },
  ],
  sections: {
    ledger: makeLedgerSection({ scope: "vendor" }),
    overview: VendorOverviewSection,
    company: makeFieldsSection(VENDOR_COMPANY_FIELDS),
    contact: makeFieldsSection(VENDOR_CONTACT_FIELDS),
    contacts: makeRecordItemsSection({
      kind: "contact",
      fields: VENDOR_CONTACT_RECORD_FIELDS,
      singular: "Contact",
      plural: "Contacts",
      icon: Users,
      emptyDescription: "Add dispatchers, billing contacts, and technicians.",
      summary: (r) => ({
        title: r.name,
        meta: [r.relation, r.email, r.phone].filter(Boolean).join(" · "),
        badge: r.isPrimary ? "Primary" : undefined,
        badgeVariant: "info",
      }),
    }),
    trades: makeLoadedFieldsSection(VENDOR_TRADE_FIELDS),
    availability: makeFieldsSection(VENDOR_AVAILABILITY_FIELDS),
    rates: makeFieldsSection(VENDOR_RATE_FIELDS),
    payment: makeLoadedFieldsSection(VENDOR_PAYMENT_FIELDS),
    tax: makeLoadedFieldsSection(VENDOR_TAX_FIELDS),
    compliance: VendorComplianceSection,
    insurance: VendorCoiSection,
    licenses: VendorLicenseSection,
    workOrders: makeWorkOrdersSection({
      idKey: "vendorId",
      nameKey: "vendorName",
      emptyDescription: "Work orders assigned to this vendor show up here.",
    }),
    bills: vendorBillsSection,
    reviews: VendorReviewsSection,
    portal: VendorPortalSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    notes: makeNotesSection({ field: "notes", placeholder: "Private notes about this vendor…" }),
    customFields: makeCustomFieldsSection("vendors"),
  },
};

export default vendorsConfig;
