"use client";

import { useState } from "react";
import { toast } from "sonner";
import { LayoutDashboard, Repeat, Send, Clock, Loader2, ReceiptText } from "lucide-react";

import { EmptyState, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { Button } from "@/components/ui/button";
import { EntityListScreen } from "@/components/internal/screens/entity/entity_list_screen";
import { recurringChargesLayer } from "@/lib/supabase/recurring_charges";
import { rentAccountsLayer } from "@/lib/supabase/rent_collection";
import { listTenants } from "@/lib/supabase/tenants";
import { glAccountOptions, tenantOptions, unitOptions } from "@/lib/supabase/options";
import {
  makeFieldsSection,
  makeOverviewSection,
  makeNotesSection,
} from "@/components/internal/screens/entity/sections/factories";
import {
  RECURRING_STATUS_MAP,
  CHARGE_FREQUENCIES,
  FREQUENCY_MONTHS,
  filterOptions,
  optionsOf,
  currency,
  money,
  formatDate,
  todayISO,
  addMonthsISO,
  monthlyEquivalent,
} from "./shared";

// Recurring Charges — scheduled tenant charges beyond base rent (parking, pet
// rent, storage…) over `property.recurring_charges`. "Post next charge" adds the
// charge to the tenant's rent account and advances the schedule.

const FREQUENCY_OPTIONS = optionsOf(CHARGE_FREQUENCIES);
const STATUS_OPTIONS = filterOptions(RECURRING_STATUS_MAP).slice(1);

// Find the tenant's rent account: by linked tenant id, else by tenant name.
async function findRentAccount(charge) {
  if (charge.tenantId) {
    const byId = await rentAccountsLayer.list({ tenantId: charge.tenantId });
    if (byId?.length) return byId[0];
  }
  if (charge.tenantName) {
    const all = await rentAccountsLayer.list();
    const name = charge.tenantName.trim().toLowerCase();
    return (all || []).find((a) => (a.tenantName || "").trim().toLowerCase() === name) || null;
  }
  return null;
}

// Posting panel: appends this charge to the tenant's rent account charges list
// (same { id, label, amount } shape Rent Collection uses) and advances nextDate.
function PostingSection({ item, onCommit }) {
  const [busy, setBusy] = useState(false);
  const postings = Array.isArray(item?.metadata?.postings) ? item.metadata.postings : [];
  const amount = Number(item.amount) || 0;
  const canPost = item.status === "Active" && amount > 0 && (item.tenantId || item.tenantName);

  const post = async () => {
    setBusy(true);
    const account = await findRentAccount(item);
    if (!account) {
      setBusy(false);
      toast.error("No rent account found for this tenant — create one in Rent Collection first.");
      return;
    }
    const date = item.nextDate || todayISO();
    const charge = {
      id: crypto.randomUUID(),
      label: `${item.name} · ${formatDate(date)}`,
      amount,
      date,
      source: "recurring",
      recurringChargeId: item.id,
    };
    const charges = Array.isArray(account.metadata?.charges) ? account.metadata.charges : [];
    const saved = await rentAccountsLayer.update(account.id, {
      metadata: { ...(account.metadata || {}), charges: [...charges, charge] },
    });
    setBusy(false);
    if (!saved) {
      toast.error("Couldn't post the charge to the rent account.");
      return;
    }
    const months = FREQUENCY_MONTHS[item.frequency] ?? 1;
    onCommit({
      ...(months ? { nextDate: addMonthsISO(date, months) } : { status: "Ended" }),
      metadata: {
        ...(item.metadata || {}),
        postings: [
          { id: charge.id, date, amount, account: account.name, postedAt: todayISO() },
          ...postings,
        ],
      },
    });
    toast.success(`Posted ${money(amount)} to "${account.name}".`);
  };

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              Next charge: {money(amount)} on {formatDate(item.nextDate || todayISO())}
            </p>
            <p className="mt-0.5 text-sm text-text-secondary">
              {item.tenantName
                ? `Adds a charge to ${item.tenantName}'s rent account${item.frequency === "One-time" ? " and ends this charge." : ", then moves the next date forward."}`
                : "Link a tenant in Details to post this charge."}
            </p>
          </div>
          <Button
            className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={!canPost || busy}
            onClick={post}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Post next charge
          </Button>
        </div>
      </SectionCard>

      {postings.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={ReceiptText}
            title="Nothing posted yet"
            description="Charges you post appear here and on the tenant's rent account."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {postings.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">{formatDate(p.date)}</p>
                <p className="truncate text-xs text-text-secondary">
                  {p.account ? `Posted to ${p.account}` : "Posted"} · {formatDate(p.postedAt)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {money(p.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const chargesConfig = {
  key: "charge",
  singular: "Recurring charge",
  plural: "Recurring charges",
  title: "Recurring Charges",
  description:
    "Scheduled charges beyond base rent — parking, pets, storage, utilities. Post each one to the tenant's rent account when it comes due.",
  icon: Repeat,
  titleField: "name",
  searchFields: ["name", "tenantName", "unit", "account"],
  data: recurringChargesLayer.data,

  statusMap: RECURRING_STATUS_MAP,
  statusFilterOptions: filterOptions(RECURRING_STATUS_MAP),

  columns: [
    {
      key: "name",
      header: "Charge",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name}</span>
          <span className="text-xs text-text-secondary">
            {[r.tenantName, r.unit].filter(Boolean).join(" · ") || "No tenant linked"}
          </span>
        </div>
      ),
    },
    {
      key: "frequency",
      header: "Frequency",
      className: "text-sm text-text-secondary",
      render: (r) => r.frequency || "—",
    },
    {
      key: "nextDate",
      header: "Next charge",
      className: "whitespace-nowrap text-sm tabular-nums text-text-secondary",
      render: (r) => (r.status === "Active" ? formatDate(r.nextDate) : "—"),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.status} map={RECURRING_STATUS_MAP} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => money(r.amount),
    },
  ],

  stats: (rows) => {
    const active = rows.filter((r) => r.status === "Active");
    const monthly = active.reduce((s, r) => s + monthlyEquivalent(r.amount, r.frequency), 0);
    const horizon = addMonthsISO(todayISO(), 1);
    const dueSoon = active.filter((r) => r.nextDate && r.nextDate <= horizon);
    const tenants = new Set(active.map((r) => r.tenantId || r.tenantName).filter(Boolean));
    return [
      { label: "Monthly recurring", value: currency(monthly), footer: "Active charges, per month" },
      { label: "Active charges", value: String(active.length), footer: `${rows.length} total` },
      { label: "Due next 30 days", value: String(dueSoon.length), footer: currency(dueSoon.reduce((s, r) => s + (Number(r.amount) || 0), 0)) },
      { label: "Tenants billed", value: String(tenants.size), footer: "With an active charge" },
    ];
  },

  createDraft: { name: "", tenantId: "", tenantName: "", unitId: "", unit: "", amount: "", frequency: "Monthly", nextDate: "", account: "" },
  createFields: [
    { key: "name", label: "Charge", type: "text", placeholder: "e.g. Parking space #12" },
    {
      key: "tenantId",
      label: "Tenant",
      type: "select",
      optionsFrom: "tenants",
      placeholder: "Select a tenant…",
      emptyLabel: "No tenants yet — add them in Tenants",
    },
    { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
    { key: "frequency", label: "Frequency", type: "select", options: FREQUENCY_OPTIONS },
    { key: "nextDate", label: "Next charge date", type: "date" },
    {
      key: "account",
      label: "Income account",
      type: "select",
      optionsFrom: "accounts",
      placeholder: "Select an account…",
      emptyLabel: "No accounts yet — add them in Chart of Accounts",
    },
  ],
  // Tenant picks carry their unit so the charge shows where it applies.
  loadCreateOptions: async () => {
    const [tenants, units, accounts] = await Promise.all([listTenants(), unitOptions(), glAccountOptions()]);
    const unitById = new Map(units.map((u) => [u.value, u]));
    return {
      tenants: (tenants || [])
        .filter((t) => t.name)
        .map((t) => ({
          value: t.id,
          label: t.unit ? `${t.name} · ${t.unit}` : t.name,
          patch: {
            tenantName: t.name,
            unitId: t.unitId || "",
            unit: unitById.get(t.unitId)?.patch.unit || t.unit || "",
          },
        })),
      accounts,
    };
  },
  newRow: (draft) => ({
    name: draft.name.trim(),
    tenantId: draft.tenantId || "",
    tenantName: draft.tenantName || "",
    unitId: draft.unitId || "",
    unit: draft.unit || "",
    amount: Math.abs(Number(draft.amount) || 0),
    frequency: draft.frequency || "Monthly",
    nextDate: draft.nextDate || todayISO(),
    account: draft.account || "",
    status: "Active",
  }),

  headerMeta: (r) =>
    [r.tenantName, `${money(r.amount)} ${(r.frequency || "").toLowerCase()}`.trim()].filter(Boolean).join(" · "),

  navGroups: [
    {
      group: null,
      items: [
        { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "A snapshot of this charge." },
      ],
    },
    {
      group: "Charge",
      items: [
        { key: "details", label: "Details", icon: Repeat, desc: "Tenant, amount, schedule, and account." },
        { key: "posting", label: "Posting", icon: Send, desc: "Post the next charge to the tenant's rent account." },
        { key: "activity", label: "Activity", icon: Clock, desc: "Notes and history." },
      ],
    },
  ],
  sections: {
    overview: makeOverviewSection({
      fields: [
        { key: "tenantName", label: "Tenant" },
        { key: "unit", label: "Unit" },
        { key: "amount", label: "Amount", format: (v) => money(v) },
        { key: "frequency", label: "Frequency" },
        { key: "nextDate", label: "Next charge", format: (v) => formatDate(v) },
        { key: "monthly", label: "Monthly equivalent", format: (_v, r) => money(monthlyEquivalent(r.amount, r.frequency)) },
        { key: "account", label: "Income account" },
        { key: "status", label: "Status" },
      ],
    }),
    details: makeFieldsSection([
      { key: "name", label: "Charge", type: "text", full: true },
      { key: "tenantId", label: "Tenant", type: "relation", load: tenantOptions, displayKey: "tenantName" },
      { key: "unitId", label: "Unit", type: "relation", load: unitOptions, displayKey: "unit" },
      { key: "amount", label: "Amount", type: "number", placeholder: "0.00" },
      { key: "frequency", label: "Frequency", type: "select", options: FREQUENCY_OPTIONS },
      { key: "nextDate", label: "Next charge date", type: "date" },
      { key: "status", label: "Status", type: "select", options: STATUS_OPTIONS },
      { key: "account", label: "Income account", type: "relation", load: glAccountOptions, displayKey: "account", full: true },
    ]),
    posting: PostingSection,
    activity: makeNotesSection({ field: "activityNotes", placeholder: "Log a note about this charge…" }),
  },
};

export function RecurringChargesScreen() {
  return <EntityListScreen config={chargesConfig} />;
}

export default RecurringChargesScreen;
