"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  LayoutDashboard,
  CalendarClock,
  ExternalLink,
  Link2,
  CircleDollarSign,
  Percent,
  Repeat,
  Clock,
  BookOpen,
  Loader2,
  Send,
  Info,
  TriangleAlert,
} from "lucide-react";

import { DataTable, EmptyState, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Badge } from "@geiger/ui/badge";
import { LogoLoading } from "@geiger/ui";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { rentAccountsData, listRentAccountsWithBalances } from "@/lib/supabase/rent_collection";
import { leasesLayer } from "@/lib/supabase/leases";
import { listTenants } from "@/lib/supabase/tenants";
import { listUnits } from "@/lib/supabase/units";
import { assessLateFeeApi, billLeaseNowApi, lateFeePreviewApi } from "@/lib/billing/api";
import { periodLabel } from "@/lib/billing/periods";
import { LATE_FEE_STATUS } from "@/lib/billing/late_fee_rules";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { leaseOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import { LedgerView } from "./ledger_section";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { NO_POST, useCanPost } from "./ledger_dialogs";
import { SummaryTiles, withMetaMirror } from "./sections";
import {
  RENT_STATUS_MAP,
  filterOptions,
  currency,
  money,
  ordinalDay,
} from "./shared";

// Rent Collection — an entity screen over `property.rent_accounts`, the collection record per lease; its balance is the lease's AR and its rent the lease's schedule (CORE-01).

const METHOD_OPTIONS = [
  { value: "ACH", label: "Bank (ACH)" },
  { value: "Card", label: "Card" },
  { value: "Check", label: "Check" },
  { value: "Cash", label: "Cash" },
];

// The account's ledger balance (listRentAccountsWithBalances, CORE-07).
const balanceOf = (r) => Number(r?.balance) || 0;

// Ledger dimensions for a rent account (its lease, else its tenant).
const ledgerDims = (i) => ({ leaseId: i.leaseId, tenantId: i.tenantId, unitId: i.unitId, propertyId: i.propertyId });

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

// Late-fee status pills (CORE-06 statuses → badge variants).
const LATE_VARIANT = { due: "danger", posted: "info", capped: "warning", paid: "success", eviction: "warning", exempt: "purple", payment_plan: "info" };
const LATE_STATUS_MAP = Object.fromEntries(Object.entries(LATE_FEE_STATUS).map(([k, label]) => [k, { label, variant: LATE_VARIANT[k] || "neutral" }]));

// Why a whole lease gets no late fees, in a sentence.
const LATE_STOP_DETAIL = {
  no_fee: "The late fee policy for this lease is “No late fee”.",
  exempt: "The tenant is marked “Don't charge late fees” on their payment settings.",
  eviction: "The lease is in eviction, and the policy doesn't charge late fees during one.",
  payment_plan: "An active payment plan in good standing suspends late fees.",
  inactive: "Late fees run on live leases only.",
};

const lateRule = (p) =>
  p.lateFeeType === "none"
    ? "No late fee"
    : [
        p.lateFeeType === "percent" ? `${p.lateFeeAmount}% of rent` : p.lateFeeType === "daily" ? `${money(p.lateFeeAmount)} + ${money(p.dailyLateFee)}/day` : money(p.lateFeeAmount),
        Number(p.maxLateFee) > 0 ? `max ${money(p.maxLateFee)}` : "",
      ]
        .filter(Boolean)
        .join(", ");

const LATE_COLUMNS = [
  { key: "period", header: "Rent month", className: "whitespace-nowrap text-sm text-foreground", render: (r) => periodLabel(r.period) },
  { key: "daysLate", header: "Days late", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => Math.max(0, r.daysLate) },
  { key: "open", header: "Unpaid rent", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => money(r.open) },
  { key: "target", header: "Target", align: "right", className: "text-right tabular-nums text-text-secondary", render: (r) => (["due", "posted", "capped"].includes(r.status) ? money(r.target) : "—") },
  { key: "posted", header: "Posted", align: "right", className: "text-right tabular-nums text-foreground", render: (r) => money(r.posted) },
  { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} map={LATE_STATUS_MAP} /> },
];

// Late fees per unpaid rent month (CORE-06): posted to date vs the policy target and why fees stop; posting runs the daily job's assessment on the server.
function LateFeeSection({ item, onNavigate }) {
  const [loaded, setLoaded] = useState(null);
  const [busy, setBusy] = useState(false);
  const canPost = useCanPost();
  useEffect(() => {
    if (!item.leaseId) return undefined;
    let alive = true;
    lateFeePreviewApi(item.leaseId).then((res) => {
      if (alive) setLoaded({ ...res, leaseId: item.leaseId });
    });
    return () => {
      alive = false;
    };
  }, [item.leaseId]);
  // A preview for another lease is stale: show the loader until this lease's arrives.
  const state = loaded?.leaseId === item.leaseId ? loaded : null;

  if (!item.leaseId) {
    return (
      <SectionCard>
        <p className="text-sm text-text-secondary">Link a lease to this account to assess late fees.</p>
      </SectionCard>
    );
  }
  if (!state) {
    return (
      <div className="flex justify-center py-10">
        <LogoLoading size={40} aria-label="Loading late fees" />
      </div>
    );
  }
  if (!state.ok) {
    return (
      <SectionCard>
        <p className="text-sm text-text-secondary">{state.error || "Couldn't load the late fees."}</p>
      </SectionCard>
    );
  }

  const rows = state.periods || [];
  const posted = rows.reduce((s, r) => s + r.posted, 0);
  const target = rows.reduce((s, r) => s + (["due", "posted", "capped"].includes(r.status) ? Math.max(r.target, r.posted) : r.posted), 0);
  const due = rows.reduce((s, r) => s + r.delta, 0);
  const guidance = state.guidance || { warnings: [], sources: [] };

  const post = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    setBusy(true);
    const res = await assessLateFeeApi(item.leaseId);
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error || "Couldn't post the late fee.");
      return;
    }
    if (res.skipped === "closed") {
      toast.error("This month is closed in accounting, so the late fee can't post.");
      return;
    }
    const created = (res.entries || []).filter((e) => e.created);
    if (!created.length) {
      toast.success("Late fees are already up to date.");
      setLoaded((prev) => ({ ...prev, ...res, leaseId: item.leaseId }));
      return;
    }
    toast.success(`Posted ${money(created.reduce((s, e) => s + e.amount, 0))} in late fees${res.noticeSent ? " and sent the late notice" : ""}.`);
    onNavigate?.("ledger");
  };

  return (
    <div className="space-y-4">
      <SummaryTiles
        items={[
          { label: "Rule", value: lateRule(state.policy || {}) },
          { label: "Grace period", value: `${state.policy?.graceDays || 0} days` },
          { label: "Posted to date", value: money(posted) },
          { label: "Target now", value: money(target), className: due > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
        ]}
      />

      {state.stop ? (
        <p className="flex items-start gap-2 rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-medium text-foreground">{LATE_FEE_STATUS[state.stop]}.</span> {LATE_STOP_DETAIL[state.stop] || ""}
          </span>
        </p>
      ) : null}

      {guidance.warnings.length ? (
        <div className="space-y-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          {guidance.warnings.map((w) => (
            <p key={w} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              {w}
            </p>
          ))}
          {guidance.sources.length ? (
            <ul className="space-y-1 pl-6">
              {guidance.sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                    {s.citation || s.title}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <SectionCard
        title="By rent month"
        description="Each unpaid month accrues toward its policy target; a missed day catches up on the next run."
        bodyPadding={false}
      >
        <DataTable
          className="rounded-none border-0"
          columns={LATE_COLUMNS}
          data={rows}
          getRowKey={(r) => r.period}
          empty={<EmptyState className="py-10" icon={Percent} title="No rent is overdue" description="Late fees start once a month's rent is past its grace period." />}
        />
      </SectionCard>

      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-text-secondary">
            Late fees follow Fees &amp; Policies — company defaults, overridden per property and lease. The daily job posts them
            automatically; post now to run the same assessment today.
          </p>
          <RoleGate allowed={canPost} reason={NO_POST}>
            <Button className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy || !canPost || due <= 0} onClick={post}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Percent className="h-4 w-4" />}
              Post Late Fee{due > 0 ? ` (${money(due)})` : ""}
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
    { value: "plan", label: "On a plan", filter: (r) => Boolean(r.paymentPlan) },
  ],

  exportColumns: [
    { header: "Account", key: "name" },
    { header: "Tenant", key: "tenantName" },
    { header: "Unit", key: "unit" },
    { header: "Status", key: "status" },
    { header: "Current rent", key: "rent", type: "money" },
    { header: "Balance", value: (r) => balanceOf(r), type: "money" },
    { header: "Due day", key: "dueDay", type: "number" },
    { header: "Autopay", value: (r) => Boolean(r.autopay), type: "bool" },
    { header: "Deferred (plan)", value: (r) => r.paymentPlan?.deferred || 0, type: "money" },
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
          {r.paymentPlan ? (
            <span className="w-fit">
              <Badge variant="info">On a plan · {money(r.paymentPlan.deferred)} deferred</Badge>
            </span>
          ) : null}
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
      hint: "Re-splits a voucher month at today's assistance amount.",
      icon: Send,
      permission: "property.accounting.post",
      showIf: (i) => Boolean(i.leaseId),
      run: async ({ item, reload, navigate }) => {
        const res = await billLeaseNowApi(item.leaseId);
        if (!res.ok) {
          toast.error(res.error || "Couldn't bill the rent.");
          return;
        }
        const posted = (res.entries || []).filter((e) => e.created);
        const month = periodLabel(res.period);
        // Charges and true-up credits per payer, so a voucher re-split never reads as a negative bill.
        const total = (list) => list.reduce((t, e) => t + e.amount, 0);
        const describe = (who, list) => {
          const charged = total(list.filter((e) => e.amount > 0));
          const credited = -total(list.filter((e) => e.amount < 0));
          return [charged > 0 ? `${who} billed ${money(charged)}` : "", credited > 0 ? `${who} credited ${money(credited)} (true-up)` : ""].filter(Boolean);
        };
        const isHap = (e) => String(e.kind).startsWith("hap");
        const parts = [...describe("Tenant", posted.filter((e) => !isHap(e))), ...describe("Housing authority", posted.filter(isHap))];
        toast.success(posted.length ? `${month}: ${parts.join("; ")}.` : `${month} rent is already billed (${money(res.billed)}).`);
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
        { key: "status", label: "Status" },
      ],
      note: "Balance is the lease's Accounts Receivable in the general ledger.",
    }),
    ledger: RentLedgerSection,
    links: LinksSection,
    schedule: RentScheduleSection,
    lateFees: LateFeeSection,
    autopay: makeFieldsSection([
      {
        key: "status",
        label: "Collections status",
        type: "select",
        options: filterOptions(RENT_STATUS_MAP).slice(1),
        hint: "Each billing run sets Current, Due or Overdue from the ledger; In collections stays until you change it.",
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
