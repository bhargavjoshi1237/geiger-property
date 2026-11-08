"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  CalendarClock,
  ExternalLink,
  Link2,
  ReceiptText,
  CircleDollarSign,
  Percent,
  Repeat,
  Clock,
  BookOpen,
  Loader2,
  Send,
} from "lucide-react";

import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { rentAccountsData, listRentAccountsWithBalances } from "@/lib/supabase/rent_collection";
import { leasesLayer, getLease } from "@/lib/supabase/leases";
import { listTenants } from "@/lib/supabase/tenants";
import { listUnits } from "@/lib/supabase/units";
import { getProperty } from "@/lib/supabase/properties";
import { getSetting } from "@/lib/supabase/settings";
import { ledgerErrorMessage, postLateFee } from "@/lib/supabase/ledger";
import { billLeaseNowApi } from "@/lib/billing/api";
import { periodLabel } from "@/lib/billing/periods";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import { computeLateFee, effectivePolicies } from "@/lib/policies";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeMetaListSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { LedgerView } from "./ledger_section";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { NO_POST, useCanPost } from "./ledger_dialogs";
import { SectionLoading, SummaryTiles, withMetaMirror } from "./sections";
import {
  RENT_STATUS_MAP,
  filterOptions,
  currency,
  money,
  formatDate,
  todayISO,
  ordinalDay,
  billedOf,
  collectedOf,
  balanceOf,
} from "./shared";

// Rent Collection — an entity screen over `property.rent_accounts`, the collection record per lease; its balance is the lease's AR and its rent the lease's schedule (CORE-01).

const METHOD_OPTIONS = [
  { value: "ACH", label: "Bank (ACH)" },
  { value: "Card", label: "Card" },
  { value: "Check", label: "Check" },
  { value: "Cash", label: "Cash" },
];

const hasLegacy = (field) => (i) => Array.isArray(i?.metadata?.[field]) && i.metadata[field].length > 0;

// Ledger dimensions for a rent account (its lease, else its tenant).
const ledgerDims = (i) => ({ leaseId: i.leaseId, tenantId: i.tenantId, unitId: i.unitId, propertyId: i.propertyId });

// This period's due date (YYYY-MM-DD) for a due day of month.
const dueDateThisMonth = (dueDay) => {
  const t = todayISO();
  const [y, m] = t.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${t.slice(0, 7)}-${String(Math.min(Number(dueDay) || 1, last)).padStart(2, "0")}`;
};

const daysBetween = (a, b) => Math.floor((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);

// The lease's rent, due day and billing, read-only here: rent changes on the lease's Rent & Escalations tab.
function RentScheduleSection({ item }) {
  const { openItemInTab } = useWorkspaceUrl();
  const rows = [
    ["Current rent", item.leaseId ? `${currency(item.rent)} / month` : "No lease linked"],
    ["Due", `${ordinalDay(item.dueDay)} of each month (rent policy)`],
    ["Frequency", "Monthly"],
    ["Billing", item.leaseId ? "Billed automatically from the lease's rent schedule on the due day." : "Link a lease to bill rent."],
  ];
  return (
    <SectionCard
      title="Rent & schedule"
      description="Rent follows the lease. Change it with a dated step on the lease's Rent & Escalations tab; the due day comes from Fees & Policies."
      action={
        item.leaseId ? (
          <Button variant="outline" size="sm" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => openItemInTab(item.leaseId, "Leases")}>
            <ExternalLink className="h-4 w-4" /> Open Lease
          </Button>
        ) : null
      }
      bodyPadding={false}
    >
      <dl className="divide-y divide-border">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
            <dt className="text-text-secondary">{label}</dt>
            <dd className="text-right text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}

// Late fee from the policy cascade (company → property → lease overrides).
function LateFeeSection({ item, onNavigate }) {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const canPost = useCanPost();
  useEffect(() => {
    let alive = true;
    Promise.all([
      getSetting("fees_policies", {}),
      item.propertyId ? getProperty(item.propertyId) : null,
      item.leaseId ? getLease(item.leaseId) : null,
    ]).then(([company, property, lease]) => {
      if (alive) setState({ lease, policies: effectivePolicies({ company: company || {}, property, lease }) });
    });
    return () => {
      alive = false;
    };
  }, [item.propertyId, item.leaseId]);

  if (!state) return <SectionLoading />;
  const due = dueDateThisMonth(state.policies.rentDueDay);
  const daysLate = Math.max(0, daysBetween(due, todayISO()));
  const balance = balanceOf(item);
  const fee = balance > 0 ? computeLateFee(state.policies, state.lease?.rent ?? item.rent, daysLate) : 0;
  const p = state.policies;
  const rule =
    p.lateFeeType === "none"
      ? "No late fee"
      : p.lateFeeType === "percent"
        ? `${p.lateFeeAmount}% of rent`
        : p.lateFeeType === "daily"
          ? `${money(p.lateFeeAmount)} + ${money(p.dailyLateFee)}/day`
          : money(p.lateFeeAmount);

  const post = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    setBusy(true);
    const posted = await postLateFee({
      date: todayISO(),
      amount: fee,
      ...ledgerDims(item),
      memo: `Late fee · ${formatDate(due)} rent`,
      sourceId: item.id,
      idempotencyKey: `late:${item.leaseId || item.id}:${due.slice(0, 7)}`,
    });
    setBusy(false);
    if (!posted) {
      toast.error(ledgerErrorMessage() || "Couldn't post the late fee.");
      return;
    }
    toast.success(`Posted a ${money(fee)} late fee.`);
    onNavigate?.("ledger");
  };

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Rule", value: rule },
          { label: "Grace period", value: `${p.graceDays || 0} days` },
          { label: "Days late", value: String(daysLate) },
          { label: "Fee now", value: money(fee), className: fee > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
        ]}
      />
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">
            Late fees follow Fees &amp; Policies — company defaults, overridden per property and lease. The daily scheduler
            assesses them automatically once per month; post one by hand here if needed.
          </p>
          <RoleGate allowed={canPost} reason={NO_POST}>
            <Button className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost || fee <= 0 || !(item.leaseId || item.tenantId)} onClick={post}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Percent className="h-4 w-4" />}
              Post Late Fee
            </Button>
          </RoleGate>
        </div>
      </SectionCard>
    </div>
  );
}

// The lease's ledger, or the tenant's when no lease is linked.
function RentLedgerSection({ item }) {
  return (
    <LedgerView
      scope={item.leaseId ? "lease" : "tenant"}
      dims={ledgerDims(item)}
      item={item}
      emptyDescription="Rent bills from the lease's schedule; use Bill now from Actions, or record a payment or credit."
    />
  );
}

const LinkFields = makeFieldsSection([
  { key: "leaseId", label: "Lease", type: "relation", load: leaseOptions, full: true },
  { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
  { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
]);

// A unit pick carries its property name, which lives in the metadata bag here.
const LinksSection = withMetaMirror(LinkFields, ["propertyName"]);

const rentConfig = {
  key: "rent",
  singular: "Rent account",
  plural: "Rent accounts",
  title: "Rent Collection",
  description:
    "Every rent obligation you're collecting — charges, payments and credits post to each lease's ledger, so balances, delinquencies and late fees stay exact.",
  icon: CircleDollarSign,
  titleField: "name",
  searchFields: ["name", "unit", "tenantName"],
  data: rentAccountsData,
  rowsLoader: listRentAccountsWithBalances,

  statusMap: RENT_STATUS_MAP,
  statusFilterOptions: filterOptions(RENT_STATUS_MAP),

  views: [
    { value: "all", label: "All" },
    { value: "owing", label: "Owing", filter: (r) => balanceOf(r) > 0 },
    { value: "credit", label: "In credit", filter: (r) => balanceOf(r) < 0 },
    { value: "autopay", label: "Autopay", filter: (r) => r.autopay },
  ],

  columns: [
    {
      key: "name",
      header: "Account",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "—"}
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={RENT_STATUS_MAP} />,
    },
    {
      key: "rent",
      header: "Current rent",
      align: "right",
      className: "text-right tabular-nums text-text-secondary",
      render: (r) => currency(r.rent),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      className: "text-right font-semibold tabular-nums",
      render: (r) => {
        const bal = balanceOf(r);
        return (
          <span className={bal > 0 ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}>
            {money(bal)}
          </span>
        );
      },
    },
    {
      key: "dueDay",
      header: "Due",
      align: "right",
      className: "text-right tabular-nums text-text-tertiary",
      render: (r) => ordinalDay(r.dueDay),
    },
  ],

  stats: (rows) => {
    const rent = rows.reduce((s, r) => s + (Number(r.rent) || 0), 0);
    const outstanding = rows.reduce((s, r) => s + Math.max(0, balanceOf(r)), 0);
    const credits = rows.reduce((s, r) => s + Math.max(0, -balanceOf(r)), 0);
    const owing = rows.filter((r) => balanceOf(r) > 0);
    const current = rows.length ? Math.round(((rows.length - owing.length) / rows.length) * 100) : 0;
    return [
      { label: "Monthly rent roll", value: currency(rent), footer: `${rows.length} accounts` },
      { label: "Outstanding", value: currency(outstanding), footer: `${owing.length} owing` },
      { label: "Tenant credits", value: currency(credits), footer: "Prepaid / unapplied" },
      { label: "Accounts current", value: `${current}%`, footer: "Zero or credit balance" },
    ];
  },

  createDraft: {
    name: "",
    leaseId: "",
    tenantId: "",
    tenantName: "",
    unitId: "",
    unit: "",
    propertyId: "",
    propertyName: "",
  },
  createFields: [
    { key: "name", label: "Account label", type: "text", placeholder: "e.g. Maple Court · 4B — Jordan Blake" },
    {
      key: "leaseId",
      label: "Lease",
      type: "select",
      optionsFrom: "leases",
      placeholder: "Select a lease (fills tenant & unit)…",
      emptyLabel: "No leases yet — add them in Leases",
    },
    {
      key: "tenantId",
      label: "Tenant",
      type: "select",
      optionsFrom: "tenants",
      placeholder: "Select a tenant…",
      emptyLabel: "No tenants yet — add them in Tenants",
    },
    {
      key: "unitId",
      label: "Unit",
      type: "select",
      optionsFrom: "units",
      placeholder: "Select a unit…",
      emptyLabel: "No units yet — add them in Units",
    },
  ],

  // Relation pickers for the create dialog: a lease or tenant fills the linked tenant / unit ids and names (rent comes from the lease).
  loadCreateOptions: async () => {
    const [leases, tenants, units, unitOpts] = await Promise.all([
      leasesLayer.list(),
      listTenants(),
      listUnits(),
      unitOptions(),
    ]);
    const unitOptById = new Map(unitOpts.map((o) => [o.value, o]));
    const unitById = new Map((units || []).map((u) => [u.id, u]));
    const leaseById = new Map((leases || []).map((l) => [l.id, l]));
    // Unit display name + property link for a unit id ("" when unknown).
    const unitPatch = (unitId) => {
      const opt = unitOptById.get(unitId);
      return opt ? { unitId, ...opt.patch } : {};
    };

    const leaseOpts = (leases || []).map((l) => ({
      value: l.id,
      label: [l.name || "Lease", l.rent ? currency(l.rent) : ""].filter(Boolean).join(" — "),
      patch: {
        tenantId: l.tenantId || "",
        tenantName: l.tenantName || "",
        unitId: l.unitId || "",
        unit: l.unit || "",
        ...unitPatch(l.unitId),
        ...(l.propertyId ? { propertyId: l.propertyId } : {}),
      },
    }));

    const tenantOpts = (tenants || [])
      .filter((t) => t.name)
      .map((t) => {
        const lease = leaseById.get(t.leaseId);
        const unitId = t.unitId || lease?.unitId || "";
        return {
          value: t.id,
          label: t.unit ? `${t.name} · ${t.unit}` : t.name,
          patch: {
            tenantName: t.name,
            ...(t.leaseId ? { leaseId: t.leaseId } : {}),
            ...(unitId ? { unitId, unit: t.unit || lease?.unit || "", ...unitPatch(unitId) } : {}),
          },
        };
      });

    const unitOpts2 = unitOpts.map((o) => {
      const rent = Number(unitById.get(o.value)?.rent) || 0;
      return {
        value: o.value,
        label: rent ? `${o.label} — ${currency(rent)}` : o.label,
        patch: o.patch,
      };
    });

    return { leases: leaseOpts, tenants: tenantOpts, units: unitOpts2 };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    leaseId: draft.leaseId || "",
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    propertyId: draft.propertyId || "",
    autopay: false,
    status: "Due",
    metadata: draft.propertyName ? { propertyName: draft.propertyName } : {},
  }),

  headerMeta: (r) =>
    [r.tenantName, r.unit, currency(r.rent), `Balance ${money(balanceOf(r))}`].filter(Boolean).join(" · "),

  actions: [
    {
      key: "billNow",
      label: "Bill now",
      icon: Send,
      permission: "accounting.post",
      showIf: (i) => Boolean(i.leaseId),
      run: async ({ item, reload, navigate }) => {
        const res = await billLeaseNowApi(item.leaseId);
        if (!res.ok) {
          toast.error(res.error || "Couldn't bill the rent.");
          return;
        }
        const posted = (res.entries || []).filter((e) => e.created);
        const month = periodLabel(res.period);
        toast.success(posted.length ? `Billed ${money(posted.reduce((t, e) => t + e.amount, 0))} for ${month}.` : `${month} rent is already billed (${money(res.billed)}).`);
        navigate("ledger");
        reload();
      },
    },
  ],

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this rent account." },
      ],
    },
    {
      group: "Collection",
      items: [
        { key: "ledger", label: "Ledger", icon: BookOpen, desc: "Charges, payments and credits on this lease, with a running balance." },
        { key: "links", label: "Tenant & Unit", icon: Link2, desc: "The lease, tenant, and unit this account belongs to." },
        { key: "schedule", label: "Rent & Schedule", icon: CalendarClock, desc: "The lease's current rent and due day (read-only)." },
        { key: "charges", label: "Legacy charges", icon: ReceiptText, desc: "Charges recorded before the ledger.", showIf: hasLegacy("charges") },
        { key: "payments", label: "Legacy payments", icon: CircleDollarSign, desc: "Payments recorded before the ledger.", showIf: hasLegacy("payments") },
      ],
    },
    {
      group: "Policy",
      items: [
        { key: "lateFees", label: "Late Fees", icon: Percent, desc: "The late fee policy in force and what's owed now." },
        { key: "autopay", label: "Collection & Autopay", icon: Repeat, desc: "Collections status, autopay and the default payment method." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "tenantName", label: "Tenant" },
        { key: "unit", label: "Unit" },
        { key: "propertyName", label: "Property" },
        { key: "rent", label: "Current rent", format: (v) => currency(v) },
        { key: "dueDay", label: "Due day", format: (v) => ordinalDay(v) },
        { key: "balance", label: "Balance", format: (_v, r) => money(balanceOf(r)) },
        { key: "billed", label: "Legacy billed", format: (_v, r) => (hasLegacy("charges")(r) ? currency(billedOf(r)) : "—") },
        { key: "collected", label: "Legacy collected", format: (_v, r) => (hasLegacy("payments")(r) ? currency(collectedOf(r)) : "—") },
        { key: "status", label: "Status" },
      ],
      note: "Balance is the lease's Accounts Receivable in the general ledger.",
    }),
    ledger: RentLedgerSection,
    links: LinksSection,
    schedule: RentScheduleSection,
    charges: makeMetaListSection({
      field: "charges",
      singular: "charge",
      icon: ReceiptText,
      primaryPlaceholder: "e.g. July 2026 rent",
      secondary: { key: "amount", label: "Amount", type: "number", placeholder: "0" },
    }),
    payments: makeMetaListSection({
      field: "payments",
      singular: "payment",
      icon: CircleDollarSign,
      primaryPlaceholder: "e.g. Payment · Jul 3 (ACH)",
      secondary: { key: "amount", label: "Amount", type: "number", placeholder: "0" },
    }),
    lateFees: LateFeeSection,
    autopay: makeFieldsSection([
      {
        key: "status",
        label: "Collections status",
        type: "select",
        options: filterOptions(RENT_STATUS_MAP).slice(1),
      },
      { key: "autopay", label: "Autopay enabled", type: "switch" },
      {
        key: "paymentMethod",
        label: "Default method",
        type: "select",
        options: METHOD_OPTIONS,
      },
      { key: "paymentReference", label: "Method reference", type: "text", meta: true, placeholder: "e.g. Bank ••4321" },
      { key: "propertyName", label: "Property", type: "text", meta: true },
      { key: "address", label: "Address", type: "text", meta: true, full: true },
    ]),
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this account…" }),
  },
};

export function RentCollectionScreen() {
  return <EntityListScreen config={rentConfig} />;
}

export default RentCollectionScreen;
