import { toast } from "sonner";
import {
  LayoutDashboard,
  Contact,
  Building2,
  Percent,
  Receipt,
  FileText,
  Clock,
  Landmark,
  Wallet,
  UserCog,
  Users,
  FileBarChart,
  Wrench,
  Smartphone,
  StickyNote,
  Sliders,
  PauseCircle,
  PlayCircle,
  FileCheck2,
  Power,
  MailPlus,
  Home,
  UserX,
  UserCheck,
  BookOpen,
} from "lucide-react";
import { makeLedgerSection } from "@/components/internal/screens/accounting/ledger_section";

import { Badge } from "@geiger/ui/badge";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { ownersLayer, ownersData } from "@/lib/supabase/owners";
import { propertyOwnersLayer } from "@/lib/supabase/property_owners";
import { announceInvite, disablePortalAccess, invitePortalAccess } from "@/lib/portal/staff_api";
import {
  makeFieldsSection,
  makeNotesSection,
  makeCustomFieldsSection,
} from "@/components/internal/screens/entity/sections/factories";
import { makeRecordItemsSection } from "@/components/internal/screens/entity/sections/child_records";
import { ActivitySection } from "@/components/internal/screens/entity/shared_sections/activity_section";
import { DocumentsSection } from "@/components/internal/screens/entity/shared_sections/documents_section";
import { makeLoadedFieldsSection } from "@/components/internal/screens/people/loaded_fields";
import { TIN_TYPE_OPTIONS, last4 } from "@/components/internal/screens/people/shared";
import {
  OWNER_STATUS_MAP,
  OWNER_PROFILE_FIELDS,
  OWNER_CONTACT_FIELDS,
  OWNER_PAYOUT_FIELDS,
  OWNER_AGREEMENT_FIELDS,
  OWNER_TAX_FIELDS,
  OWNER_STATEMENT_FIELDS,
  OWNER_MAINTENANCE_FIELDS,
  OWNER_CONTACT_RECORD_FIELDS,
  ENTITY_TYPE_OPTIONS,
  filterOptions,
  selectOptions,
  holdsPayouts,
  needsW9,
  legacySplitsOf,
  percent,
  todayISO,
} from "./shared";
import {
  OWNERSHIP_FIELDS,
  OwnerOverviewSection,
  OwnerPortalSection,
  OwnerPropertiesSection,
  OwnershipsSection,
} from "./sections";

// Owners — the people and entities who own your properties (owns `property.owners`;
// ownership shares in `property.property_owners`). Distributions and statements
// come from the accounting ledger.

// Owners joined with their property_owners links (count + distinct properties).
async function loadOwners() {
  const [owners, links] = await Promise.all([ownersLayer.list(), propertyOwnersLayer.list()]);
  const byOwner = new Map();
  for (const l of links ?? []) {
    if (!byOwner.has(l.ownerId)) byOwner.set(l.ownerId, []);
    byOwner.get(l.ownerId).push(l);
  }
  return (owners ?? []).map((o) => {
    const mine = byOwner.get(o.id) || [];
    return {
      ...o,
      ownerships: mine,
      propertyCount: mine.length || legacySplitsOf(o).length,
      propertyIds: mine.map((l) => l.propertyId).filter(Boolean),
    };
  });
}

const ownerActions = [
  {
    key: "addOwnership",
    label: "Add ownership",
    icon: Home,
    wizard: {
      title: "Add ownership",
      description: "Link a property this owner holds and their share of it.",
      finishLabel: "Add Ownership",
      logSummary: "Added an ownership",
      initial: () => ({ ownershipPct: 100, isPrimary: true, startsOn: todayISO() }),
      steps: [{ key: "ownership", title: "Ownership", fields: OWNERSHIP_FIELDS }],
      finish: async (v, { item, commit, navigate }) => {
        const created = await propertyOwnersLayer.create({ id: crypto.randomUUID(), ...v, ownerId: item.id, ownerName: item.name });
        if (!created) {
          toast.error("Couldn't add the ownership.");
          return false;
        }
        await commit({ propertiesCount: (Number(item.propertiesCount) || 0) + 1 });
        toast.success(`Linked ${v.propertyName || "the property"}.`);
        navigate("ownerships");
        return true;
      },
    },
  },
  {
    key: "holdPayouts",
    label: "Hold payouts",
    icon: PauseCircle,
    showIf: (o) => !o.metadata?.holdPayouts,
    wizard: {
      title: "Hold payouts",
      description: "Owner draws stop until you release them. Rent keeps posting to the ledger.",
      finishLabel: "Hold Payouts",
      logSummary: "Held payouts",
      steps: [
        {
          key: "hold",
          title: "Hold",
          fields: [
            { key: "holdReason", label: "Reason", type: "text", required: true, full: true, placeholder: "e.g. Pending roof repair" },
            { key: "holdUntil", label: "Review on", type: "date" },
          ],
        },
      ],
      finish: async (v, { commitMeta }) => {
        const ok = await commitMeta({ holdPayouts: true, holdReason: v.holdReason, holdUntil: v.holdUntil || "", holdSince: todayISO() });
        if (ok) toast.success("Payouts on hold.");
        return ok;
      },
    },
  },
  {
    key: "releasePayouts",
    label: "Release payouts",
    icon: PlayCircle,
    showIf: (o) => Boolean(o.metadata?.holdPayouts),
    run: async ({ commitMeta, log }) => {
      if (!(await commitMeta({ holdPayouts: false, holdReason: "", holdUntil: "" }))) return;
      log("Released payouts");
      toast.success("Payouts released.");
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
      initial: (o) => ({
        w9ReceivedOn: todayISO(),
        tinType: o.metadata?.tinType || "SSN",
        taxpayerName: o.metadata?.taxpayerName || o.company || o.name,
        taxIdLast4: o.taxIdLast4 || "",
      }),
      steps: [
        {
          key: "w9",
          title: "W-9",
          fields: [
            { key: "w9ReceivedOn", label: "Received", type: "date", required: true },
            { key: "taxpayerName", label: "Taxpayer name", type: "text", required: true },
            { key: "tinType", label: "TIN type", type: "select", options: TIN_TYPE_OPTIONS },
            { key: "taxIdLast4", label: "TIN (last 4)", type: "text", required: true, placeholder: "1234" },
          ],
          validate: (v) => (last4(v.taxIdLast4).length === 4 ? null : "Enter the last four digits of the TIN."),
        },
      ],
      finish: async (v, { commit, commitMeta }) => {
        const ok =
          (await commit({ taxIdLast4: last4(v.taxIdLast4) })) &&
          (await commitMeta({ w9OnFile: true, w9ReceivedOn: v.w9ReceivedOn, tinType: v.tinType, taxpayerName: v.taxpayerName }));
        if (ok) toast.success("W-9 recorded.");
        return ok;
      },
    },
  },
  {
    key: "togglePortal",
    label: "Toggle portal access",
    icon: Power,
    // Server creates / disables the portal member, mirrors access onto the owner, and emails the invite.
    run: async ({ item, reload }) => {
      const enable = !item.portalAccess;
      const email = item.metadata?.portalInviteEmail || item.email;
      if (enable && !email) {
        toast.error("Add an email for this owner first.");
        return;
      }
      const res = enable
        ? await invitePortalAccess({ partyType: "owner", partyId: item.id, email })
        : await disablePortalAccess({ partyType: "owner", partyId: item.id });
      if (enable) announceInvite(res, email);
      else if (res.ok) toast.success("Portal access disabled.");
      else toast.error(res.error || "Couldn't disable portal access.");
      if (res.ok) reload();
    },
  },
  {
    key: "resendPortalInvite",
    label: "Resend portal invite",
    icon: MailPlus,
    showIf: (o) => Boolean(o.portalAccess),
    run: async ({ item, reload }) => {
      const email = item.metadata?.portalInviteEmail || item.email;
      if (!email) {
        toast.error("Add an email for this owner first.");
        return;
      }
      const res = await invitePortalAccess({ partyType: "owner", partyId: item.id, email });
      if (announceInvite(res, email)) reload();
    },
  },
  {
    key: "deactivate",
    label: "Deactivate owner",
    icon: UserX,
    separatorBefore: true,
    showIf: (o) => o.status !== "Inactive",
    run: async ({ commit, log }) => {
      if (!(await commit({ status: "Inactive" }))) return;
      log("Deactivated owner");
      toast.success("Owner deactivated.");
    },
  },
  {
    key: "reactivate",
    label: "Reactivate owner",
    icon: UserCheck,
    separatorBefore: true,
    showIf: (o) => o.status === "Inactive",
    run: async ({ commit, log }) => {
      if (!(await commit({ status: "Active" }))) return;
      log("Reactivated owner");
      toast.success("Owner reactivated.");
    },
  },
];

export const ownersConfig = {
  key: "owner",
  singular: "Owner",
  plural: "Owners",
  title: "Owners",
  description:
    "The people and entities who own your properties. Track ownership shares, payout settings, agreement terms, and 1099 details.",
  icon: Landmark,
  titleField: "name",
  searchFields: ["name", "company", "email", "phone"],
  data: ownersData,
  rowsLoader: loadOwners,

  statusMap: OWNER_STATUS_MAP,
  statusFilterOptions: filterOptions(OWNER_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    { value: "active", label: "Active", filter: (r) => r.status === "Active" },
    { value: "onboarding", label: "Onboarding", filter: (r) => r.status === "Onboarding", createDefaults: { status: "Onboarding" } },
    { value: "attention", label: "Needs attention", filter: (r) => holdsPayouts(r) || needsW9(r) },
    { value: "inactive", label: "Inactive", filter: (r) => r.status === "Inactive" },
  ],

  columns: [
    {
      key: "name",
      header: "Owner",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.metadata?.entityType, r.company || r.email].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={OWNER_STATUS_MAP} /> },
    {
      key: "properties",
      header: "Properties",
      render: (r) => (
        <span className="text-sm text-muted-foreground">
          {r.propertyCount ? `${r.propertyCount} ${r.propertyCount === 1 ? "property" : "properties"}` : "None linked"}
        </span>
      ),
    },
    {
      key: "payoutMethod",
      header: "Payout",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
          {r.payoutMethod || "—"}
          {holdsPayouts(r) ? <Badge variant="warning">On hold</Badge> : null}
        </span>
      ),
    },
    {
      key: "w9",
      header: "W-9",
      render: (r) =>
        r.metadata?.w9OnFile ? (
          <Badge variant="success">On file</Badge>
        ) : needsW9(r) ? (
          <Badge variant="danger">Missing</Badge>
        ) : (
          <span className="text-sm text-text-tertiary">—</span>
        ),
    },
    {
      key: "managementFeePct",
      header: "Mgmt fee",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => percent(r.managementFeePct),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active");
    const fees = active.map((r) => Number(r.managementFeePct) || 0).filter(Boolean);
    const avgFee = fees.length ? fees.reduce((s, n) => s + n, 0) / fees.length : 0;
    const properties = new Set(rows.flatMap((r) => r.propertyIds));
    return [
      { label: "Owners", value: String(rows.length), footer: `${active.length} active` },
      { label: "Properties owned", value: String(properties.size), footer: "Linked through ownerships" },
      { label: "Payouts on hold", value: String(rows.filter(holdsPayouts).length), footer: `Avg fee ${percent(Math.round(avgFee * 10) / 10)}` },
      { label: "Missing W-9", value: String(rows.filter(needsW9).length), footer: "Needed for 1099s" },
    ];
  },

  createDraft: { name: "", company: "", email: "", entityType: "Individual", status: "Onboarding" },
  createFields: [
    { key: "name", label: "Owner name", type: "text", placeholder: "e.g. Priya Raman" },
    { key: "entityType", label: "Entity type", type: "select", options: ENTITY_TYPE_OPTIONS },
    { key: "company", label: "Company / legal name", type: "text", placeholder: "Optional, e.g. Raman Holdings LLC" },
    { key: "email", label: "Email", type: "text", placeholder: "owner@example.com" },
    { key: "status", label: "Status", type: "select", options: selectOptions(OWNER_STATUS_MAP) },
  ],
  newRow: (draft) => ({
    name: draft.name.trim(),
    company: draft.company || "",
    email: draft.email || "",
    status: draft.status || "Onboarding",
    payoutMethod: "ACH",
    since: todayISO(),
    metadata: { entityType: draft.entityType || "Individual", requires1099: true, portalStatus: "Not invited" },
  }),

  headerMeta: (r) =>
    [r.metadata?.entityType, r.company, r.email, r.managementFeePct ? `${percent(r.managementFeePct)} fee` : null]
      .filter(Boolean)
      .join(" · "),

  actions: ownerActions,

  navGroups: [
    {
      group: null,
      items: [{ key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this owner and anything needing attention." }],
    },
    {
      group: "Owner",
      items: [
        { key: "profile", label: "Profile & Entity", icon: UserCog, desc: "Entity type, legal name, and signer." },
        { key: "contact", label: "Contact & Addresses", icon: Contact, desc: "How to reach them, mailing and remit addresses." },
        { key: "contacts", label: "Additional Contacts", icon: Users, desc: "Spouse, accountant, attorney, and other contacts." },
      ],
    },
    {
      group: "Properties",
      items: [
        { key: "ownerships", label: "Ownerships", icon: Building2, desc: "Properties held and this owner's share of each." },
        { key: "properties", label: "Related Properties", icon: Home, desc: "The properties this owner holds." },
      ],
    },
    {
      group: "Money",
      items: [
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Contributions, distributions and owner-level activity." },
        { key: "payouts", label: "Payout Settings", icon: Wallet, desc: "Method, bank, holds, reserve, and distribution day." },
        { key: "agreement", label: "Management Agreement", icon: Percent, desc: "Agreement term and fee overrides." },
        { key: "tax", label: "Tax & 1099", icon: Receipt, desc: "TIN, W-9, and 1099 delivery." },
        { key: "statements", label: "Statements & Reports", icon: FileBarChart, desc: "What this owner receives and how." },
      ],
    },
    {
      group: "Operations",
      items: [
        { key: "maintenance", label: "Maintenance Approvals", icon: Wrench, desc: "Approval limits and maintenance preferences." },
        { key: "portal", label: "Owner Portal", icon: Smartphone, desc: "Portal access and permissions." },
      ],
    },
    {
      group: "Files & history",
      items: [
        { key: "documents", label: "Documents", icon: FileText, desc: "Management agreements, W-9s, and paperwork." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Changes and notes on this owner." },
        { key: "notes", label: "Notes", icon: StickyNote, desc: "Private notes for your team." },
        { key: "customFields", label: "Custom Fields", icon: Sliders, desc: "Extra fields defined in Settings → Custom Fields." },
      ],
    },
  ],
  sections: {
    ledger: makeLedgerSection({ scope: "owner" }),
    overview: OwnerOverviewSection,
    profile: makeFieldsSection(OWNER_PROFILE_FIELDS),
    contact: makeFieldsSection(OWNER_CONTACT_FIELDS),
    contacts: makeRecordItemsSection({
      kind: "contact",
      fields: OWNER_CONTACT_RECORD_FIELDS,
      singular: "Contact",
      plural: "Contacts",
      icon: Users,
      emptyDescription: "Add people who act for this owner — an accountant, spouse, or attorney.",
      summary: (r) => ({
        title: r.name,
        meta: [r.relation, r.email, r.phone].filter(Boolean).join(" · "),
        badge: r.receivesStatements ? "Gets statements" : r.canApprove ? "Can approve" : undefined,
        badgeVariant: "info",
      }),
    }),
    ownerships: OwnershipsSection,
    properties: OwnerPropertiesSection,
    payouts: makeLoadedFieldsSection(OWNER_PAYOUT_FIELDS),
    agreement: makeFieldsSection(OWNER_AGREEMENT_FIELDS),
    tax: makeLoadedFieldsSection(OWNER_TAX_FIELDS),
    statements: makeFieldsSection(OWNER_STATEMENT_FIELDS),
    maintenance: makeFieldsSection(OWNER_MAINTENANCE_FIELDS),
    portal: OwnerPortalSection,
    documents: DocumentsSection,
    activity: ActivitySection,
    notes: makeNotesSection({ field: "activityNotes", placeholder: "Private notes about this owner…" }),
    customFields: makeCustomFieldsSection("owners"),
  },
};

export default ownersConfig;
