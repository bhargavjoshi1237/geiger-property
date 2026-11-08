"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Loader2, PiggyBank, Receipt, Repeat, Tag, TrendingUp } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import { Switch } from "@geiger/ui/switch";
import { ListLoading, SectionCard } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords, recordItemsAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { recurringChargesLayer } from "@/lib/supabase/recurring_charges";
import { securityDepositsLayer } from "@/lib/supabase/security_deposits";
import { listRecordItems } from "@/lib/supabase/record_items";
import { ledgerErrorMessage, postCharge } from "@/lib/supabase/ledger";
import { RoleGate } from "@/components/internal/shared/role_gate";
import { NO_POST, useCanPost } from "@/components/internal/screens/accounting/ledger_dialogs";
import { getSetting } from "@/lib/supabase/settings";
import { getProperty } from "@/lib/supabase/properties";
import { effectivePolicies } from "@/lib/policies";
import { usePermission } from "@/context/rbac-context";
import { PRE_LIVE_STATUSES, STEP_SOURCE_LABELS, billingWindow, firstCharge, initialStepFor, stepInForce } from "@/lib/billing/rent";
import { cancelLeaseRentStep, createLeaseRentStep, listLeaseRentSteps } from "@/lib/supabase/lease_rent_steps";
import { incomeAccountOptions } from "@/lib/supabase/gl_accounts";
import { FREQUENCY_OPTIONS, billsWithRent, frequencyLabel } from "@/lib/billing/frequency";
import { layerAdapter, leaseLinks } from "../adapters";
import {
  BENEFIT_CATALOG,
  CHARGE_TYPE_OPTIONS,
  CONCESSION_TYPE_OPTIONS,
  DEPOSIT_ALTERNATIVE_OPTIONS,
  DEPOSIT_KIND_OPTIONS,
  DEPOSIT_STATUS_MAP,
  MOVE_IN_CHARGE_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  money2,
  optionLabel,
  shiftDate,
  sumBy,
  todayISO,
} from "../shared";

// Money tabs of the lease editor: rent & escalations, recurring charges, benefits, move-in costs, concessions and deposits; rent bills from the schedule (lib/billing).

// Effective policies for a lease (company → property → lease overrides).
function useLeasePolicies(item) {
  const [policies, setPolicies] = useState(null);
  useEffect(() => {
    let alive = true;
    Promise.all([getSetting("fees_policies", {}), item.propertyId ? getProperty(item.propertyId) : null]).then(
      ([company, property]) => alive && setPolicies({ company: company || {}, property }),
    );
    return () => {
      alive = false;
    };
  }, [item.propertyId]);
  return useMemo(
    () => (policies ? effectivePolicies({ company: policies.company, property: policies.property, lease: item }) : null),
    [policies, item],
  );
}

// --- Rent & escalations ---------------------------------------------------------
// Dated rent steps are the only source of billed rent (CORE-01); changes go through /api/billing, which re-projects, syncs and trues up.

const RENT_META_FIELDS = [
  { key: "marketRent", label: "Market rent", type: "currency", meta: true, hint: "For loss-to-lease reporting." },
  { key: "rentNotes", label: "Rent notes", type: "textarea", meta: true, placeholder: "e.g. Rent includes one parking space." },
];

const STEP_FIELDS = [
  { key: "effectiveDate", label: "Effective date", type: "date", required: true },
  {
    key: "changeMode",
    label: "Change by",
    type: "select",
    options: [
      { value: "amount", label: "New monthly amount" },
      { value: "percent", label: "Percent change" },
    ],
    required: true,
  },
  { key: "amount", label: "New monthly rent", type: "currency", showIf: (v) => v.changeMode !== "percent" },
  { key: "changeValue", label: "Change", type: "percent", showIf: (v) => v.changeMode === "percent", hint: "Of the rent in force the day before." },
  { key: "note", label: "Note", type: "text", full: true, placeholder: "e.g. Year 2 escalation" },
];

// Dialog values → the step the API takes; future dates are scheduled changes, today or earlier a rent change.
const stepInput = (v, replaces) => ({
  effectiveDate: v.effectiveDate,
  changeMode: v.changeMode === "percent" ? "percent" : "amount",
  ...(v.changeMode === "percent" ? { changeValue: Number(v.changeValue) } : { amount: Number(v.amount) }),
  note: v.note || "",
  source: v.source && v.source !== "initial" ? v.source : v.effectiveDate > todayISO() ? "schedule" : "manual",
  ...(replaces ? { replaces } : {}),
});

const announceAdjustments = (res) => {
  const posted = (res.entries || []).filter((e) => e.created);
  if (posted.length) toast.info(`Posted ${posted.length} rent adjustment${posted.length === 1 ? "" : "s"} for months already billed.`);
};

function stepAdapter(onChanged) {
  const done = (res, value) => {
    if (!res.ok) return { error: res.error };
    announceAdjustments(res);
    onChanged();
    return value(res);
  };
  return {
    load: (item) => listLeaseRentSteps(item.id),
    create: async (item, values) => done(await createLeaseRentStep(item.id, stepInput(values)), (r) => r.step),
    update: async (row, values) => done(await createLeaseRentStep(row.leaseId, stepInput({ ...values, source: row.source }, row.id)), (r) => r.step),
    remove: async (row) => done(await cancelLeaseRentStep(row.leaseId, row.id), () => true),
  };
}

export function RentSection({ item, config, onPatch, onCommit, onCommitMeta, onReload }) {
  const preLive = PRE_LIVE_STATUSES.includes(item.status);
  const canManage = usePermission("property.rent.manage");
  const canEditLeases = usePermission("property.leases.view");
  // Leasing staff may set the starting rent until the lease bills; billed rent needs rent.manage.
  const canSetStartingRent = canManage || (canEditLeases && !billingWindow(item).billable);
  const [tick, setTick] = useState(0);
  const [steps, setSteps] = useState(null);
  const [saving, setSaving] = useState(false);
  const [rentDraft, setRentDraft] = useState(null);
  // A new adapter per change makes ChildRecords refetch the re-projected schedule.
  const adapter = useMemo(
    () =>
      stepAdapter(() => {
        setTick((t) => t + 1);
        onReload?.();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tick],
  );

  useEffect(() => {
    let alive = true;
    listLeaseRentSteps(item.id).then((rows) => alive && setSteps(rows ?? []));
    return () => {
      alive = false;
    };
  }, [item.id, tick]);

  const today = todayISO();
  const inForce = steps?.length ? stepInForce(steps, today) : null;
  const next = (steps || []).find((s) => s.effectiveDate > today && s.id !== inForce?.id);

  // Draft / Pending: the rent field edits the initial step on the server, which alone writes leases.rent (lease_sync_current_rent).
  const startingRent = Number(steps?.[0]?.amount ?? item.rent) || 0;
  const commitRent = async (partial) => {
    const amount = Number(partial.rent);
    if (!("rent" in partial) || partial.rent === "" || !(amount >= 0) || amount === startingRent) {
      setRentDraft(null);
      return true;
    }
    setSaving(true);
    const res = await createLeaseRentStep(item.id, { source: "initial", amount });
    setSaving(false);
    setRentDraft(null);
    if (!res.ok) {
      toast.error(res.error || "Couldn't save the rent.");
      return false;
    }
    setTick((t) => t + 1);
    onReload?.();
    return true;
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title={preLive ? "Monthly rent" : "Current rent"}
        description={
          preLive
            ? "The starting rent. Once the lease is live, change it with a dated step below."
            : "The schedule step in force today. Rent bills from the schedule automatically each month."
        }
      >
        <div className="space-y-4">
          {preLive ? (
            <FieldsForm
              item={{ ...item, rent: rentDraft ?? startingRent }}
              fields={[{ key: "rent", label: "Monthly rent", type: "currency", required: true, disabled: () => !canSetStartingRent || saving }]}
              onPatch={(p) => "rent" in p && setRentDraft(p.rent)}
              onCommit={commitRent}
              onCommitMeta={onCommitMeta}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-text-secondary">Current rent</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{money2(item.rent)} / month</dd>
                <dd className="text-xs text-text-tertiary">{inForce ? `In force since ${formatDate(inForce.effectiveDate)}` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-text-secondary">Next change</dt>
                <dd className="mt-1 text-lg font-semibold tabular-nums text-foreground">{next ? `${money2(next.amount)} / month` : "None scheduled"}</dd>
                <dd className="text-xs text-text-tertiary">{next ? `From ${formatDate(next.effectiveDate)}` : ""}</dd>
              </div>
            </dl>
          )}
          <FieldsForm item={item} fields={RENT_META_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
        </div>
      </SectionCard>

      <SectionCard
        title="Rent schedule & escalations"
        description="Dated rent amounts — a new amount or a percent of the prior rent. Changing a month already billed posts an adjustment."
      >
        <ChildRecords
          item={item}
          config={config}
          adapter={adapter}
          fields={STEP_FIELDS}
          singular="Rent change"
          icon={TrendingUp}
          readOnly={!canManage}
          defaults={(l) => ({ changeMode: "percent", changeValue: 3, effectiveDate: shiftDate(l.termStart || todayISO(), { years: 1 }) })}
          onChange={setSteps}
          emptyDescription="Add a scheduled increase, e.g. +3% on each lease anniversary."
          summary={(r) => {
            const current = inForce?.id === r.id;
            const future = r.effectiveDate > today;
            const pct = Number(r.changeValue) || 0;
            return {
              title: `From ${formatDate(r.effectiveDate)}`,
              meta: [STEP_SOURCE_LABELS[r.source] || "Rent change", r.changeMode === "percent" ? `${pct >= 0 ? "+" : ""}${pct}%` : null, r.note]
                .filter(Boolean)
                .join(" · "),
              badge: current ? "In force" : future ? "Scheduled" : "Past",
              badgeVariant: current ? "success" : future ? "info" : "neutral",
              aside: `${money2(r.amount)}/mo`,
            };
          }}
        />
      </SectionCard>
    </div>
  );
}

// --- Recurring charges ----------------------------------------------------------
// The billing job posts each due occurrence to the lease ledger (lib/billing/charges.js); Paused charges wait.

const CHARGE_STATUS_OPTIONS = [
  { value: "Active", label: "Active" },
  { value: "Paused", label: "Paused" },
  { value: "Ended", label: "Ended" },
];
const CHARGE_STATUS_VARIANT = { Active: "success", Paused: "warning", Ended: "neutral", Draft: "neutral" };

const CHARGE_FIELDS = [
  { key: "chargeType", label: "Type", type: "select", options: CHARGE_TYPE_OPTIONS, required: true },
  { key: "name", label: "Description", type: "text", required: true, placeholder: "e.g. Parking — space P-12" },
  { key: "amount", label: "Amount", type: "currency", required: true },
  { key: "frequency", label: "Frequency", type: "select", options: FREQUENCY_OPTIONS, required: true },
  { key: "glAccountId", label: "GL account", type: "relation", load: incomeAccountOptions, displayKey: "account", required: true, hint: "The income account this charge posts to." },
  { key: "nextDate", label: "Next charge date", type: "date", required: true, hint: "Missed dates catch up on the next billing run." },
  { key: "endsOn", label: "End date", type: "date", hint: "Blank to bill until the lease ends." },
  { key: "status", label: "Status", type: "select", options: CHARGE_STATUS_OPTIONS },
  { key: "billWithRent", label: "Bill with rent", type: "switch", showIf: (v) => billsWithRent(v.frequency, true), hint: "Posts on the rent due date each month." },
  { key: "prorate", label: "Prorate partial periods", type: "switch", hint: "A first or last partial period bills by the day." },
  { key: "showInPortal", label: "Show in resident portal", type: "switch" },
  { key: "memo", label: "Memo", type: "text", full: true },
];

const chargeAdapter = layerAdapter(recurringChargesLayer, "leaseId", { extra: leaseLinks });

// First of next month (local), the default start for a charge added to a lease that's already running.
const firstOfNextMonth = () => {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-01`;
};

export function ChargesSection({ item, config }) {
  return (
    <ChildRecords
      item={item}
      config={config}
      adapter={chargeAdapter}
      fields={CHARGE_FIELDS}
      singular="Recurring charge"
      icon={Repeat}
      defaults={(l) => ({
        chargeType: "Parking",
        frequency: "Monthly",
        status: "Active",
        nextDate: l.termStart && l.termStart >= todayISO() ? l.termStart : firstOfNextMonth(),
        billWithRent: true,
        prorate: false,
        showInPortal: true,
      })}
      emptyDescription="Add pet rent, parking, storage, utilities, and other charges billed with rent."
      summary={(r) => ({
        title: r.name || r.chargeType || "Charge",
        meta: [
          r.chargeType,
          frequencyLabel(r.frequency || "Monthly"),
          r.status === "Active" && r.nextDate ? `Next ${formatDate(r.nextDate)}` : null,
          r.endsOn ? `Ends ${formatDate(r.endsOn)}` : null,
          r.account || "Other Income",
        ]
          .filter(Boolean)
          .join(" · "),
        badge: r.status || "Active",
        badgeVariant: CHARGE_STATUS_VARIANT[r.status || "Active"] || "neutral",
        aside: money2(r.amount),
      })}
    />
  );
}

// --- Resident benefits package ----------------------------------------------------

export function BenefitsPackageSection({ item, onCommitMeta }) {
  const pkg = item.metadata?.benefitsPackage || {};
  const items = pkg.items || {};
  const [prices, setPrices] = useState({});
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState(false);

  const priceOf = (b) => prices[b.key] ?? items[b.key]?.price ?? b.price;
  const included = BENEFIT_CATALOG.filter((b) => items[b.key]?.included);
  const total = included.reduce((s, b) => s + (Number(priceOf(b)) || 0), 0);
  const save = (patch) => onCommitMeta({ benefitsPackage: { ...pkg, ...patch } });
  const setItem = (key, patch) => save({ items: { ...items, [key]: { ...(items[key] || {}), ...patch } } });

  // Bill the bundle as one recurring charge on this lease (create or update).
  const bill = async () => {
    setBusy(true);
    const values = {
      name: "Resident benefits package",
      chargeType: "Resident benefits package",
      amount: total,
      frequency: "Monthly",
      status: "Active",
      ...leaseLinks(item),
      leaseId: item.id,
    };
    const benefits = included.map((b) => b.label);
    // An update keeps the schedule and merges (never replaces) metadata, so the posting history survives.
    let row;
    if (pkg.chargeId) {
      row = await recurringChargesLayer.update(pkg.chargeId, values);
      if (row && !(await recurringChargesLayer.mergeMeta(pkg.chargeId, { benefits }))) row = null;
    } else {
      const nextDate = pkg.startsOn || item.termStart || todayISO();
      row = await recurringChargesLayer.create({ id: crypto.randomUUID(), ...values, nextDate, metadata: { benefits } });
    }
    setBusy(false);
    if (!row) {
      toast.error("Couldn't save the benefits charge.");
      return;
    }
    await save({ chargeId: row.id, billedAmount: total, billedOn: todayISO() });
    toast.success(`Billing ${money2(total)}/mo as one recurring charge.`);
  };

  const stop = async () => {
    setBusy(true);
    const ok = pkg.chargeId ? await recurringChargesLayer.update(pkg.chargeId, { status: "Ended" }) : true;
    setBusy(false);
    if (!ok) {
      toast.error("Couldn't stop the benefits charge.");
      return;
    }
    await save({ enabled: false, chargeId: "", billedAmount: 0 });
    toast.success("Benefits package billing stopped.");
  };

  const stale = pkg.chargeId && Number(pkg.billedAmount) !== total;

  return (
    <div className="space-y-6">
      <SectionCard
        title="Resident benefits package"
        description="Bundle services and bill them together as one monthly charge."
        action={
          <div className="flex items-center gap-2">
            <span className="text-sm text-text-secondary">Enrolled</span>
            <Switch checked={Boolean(pkg.enabled)} onCheckedChange={(v) => save({ enabled: v })} aria-label="Enrolled" />
          </div>
        }
        bodyPadding={false}
      >
        <ul className="divide-y divide-border">
          {BENEFIT_CATALOG.map((b) => (
            <li key={b.key} className="flex items-center justify-between gap-3 px-5 py-3">
              <label className="flex min-w-0 items-center gap-3 text-sm text-foreground">
                <Checkbox
                  checked={Boolean(items[b.key]?.included)}
                  disabled={!pkg.enabled}
                  onCheckedChange={(v) => setItem(b.key, { included: Boolean(v), price: Number(priceOf(b)) || 0 })}
                />
                <span className="truncate">{b.label}</span>
              </label>
              <div className="relative w-28 shrink-0">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">$</span>
                <Input
                  type="number"
                  step="0.01"
                  disabled={!pkg.enabled}
                  value={priceOf(b)}
                  onChange={(e) => setPrices((p) => ({ ...p, [b.key]: e.target.value }))}
                  onBlur={(e) => setItem(b.key, { price: Number(e.target.value) || 0 })}
                  className="pl-7 text-right tabular-nums"
                  aria-label={`${b.label} price`}
                />
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-3 border-t border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">
              {money2(total)} <span className="font-normal text-text-secondary">/ month · {included.length} services</span>
            </p>
            <p className="text-xs text-text-secondary">
              {pkg.chargeId
                ? stale
                  ? `Billing ${money2(pkg.billedAmount)}/mo — update the charge to bill the new total.`
                  : `Billed as a recurring charge since ${formatDate(pkg.billedOn)}.`
                : "Not billed yet."}
            </p>
          </div>
          <div className="flex gap-2">
            {pkg.chargeId ? (
              <Button variant="ghost" disabled={busy} onClick={stop}>
                Stop Billing
              </Button>
            ) : null}
            <Button
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={busy || !pkg.enabled || total <= 0}
              onClick={bill}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Gift className="h-4 w-4" />}
              {pkg.chargeId ? "Update Charge" : "Bill as Recurring Charge"}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Enrollment">
        <FieldsForm
          item={{ ...pkg, ...draft }}
          fields={[
            { key: "startsOn", label: "Billing starts", type: "date" },
            { key: "optedOutOn", label: "Opted out on", type: "date", hint: "Where the package is optional." },
            { key: "optional", label: "Optional for this resident", type: "switch" },
            { key: "notes", label: "Notes", type: "textarea" },
          ]}
          onPatch={(partial) => setDraft((d) => ({ ...d, ...partial }))}
          onCommit={(partial) => save(partial)}
          flat
        />
      </SectionCard>
    </div>
  );
}

// --- Move-in costs & concessions ---------------------------------------------------

const MOVE_IN_FIELDS = [
  { key: "name", label: "Charge", type: "select", options: MOVE_IN_CHARGE_OPTIONS, required: true },
  { key: "amount", label: "Amount", type: "currency", required: true },
  { key: "startsOn", label: "Due date", type: "date" },
  { key: "status", label: "Status", type: "select", options: [{ value: "Unpaid", label: "Unpaid" }, { value: "Paid", label: "Paid" }, { value: "Waived", label: "Waived" }] },
  { key: "refundable", label: "Refundable", type: "switch" },
  { key: "memo", label: "Memo", type: "text", full: true },
];

const moveInAdapter = recordItemsAdapter("move_in_charge");

// Local YYYY-MM-DD.
const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function MoveInCostsSection({ item, config, onCommitMeta }) {
  const [posting, setPosting] = useState(false);
  const canPost = useCanPost();
  const policies = useLeasePolicies(item);
  const [charges, setCharges] = useState(null);
  const [concessions, setConcessions] = useState([]);
  const [steps, setSteps] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      listRecordItems("lease", item.id, "move_in_charge"),
      listRecordItems("lease", item.id, "concession"),
      listLeaseRentSteps(item.id),
    ]).then(([c, k, r]) => {
      if (!alive) return;
      setCharges(c ?? []);
      setConcessions(k ?? []);
      setSteps(r ?? []);
    });
    return () => {
      alive = false;
    };
  }, [item.id]);

  if (!policies || charges === null || steps === null) return <ListLoading label="Loading move-in costs" className="py-10" />;

  const moveIn = item.moveInDate || item.termStart;
  // First month from the rent schedule (a lease without steps yet bills its current rent from the start).
  const first = firstCharge(item, steps.length ? steps : [initialStepFor(item)], policies);
  const prorated = first?.amount || 0;
  const due = charges.filter((c) => c.status !== "Waived");
  const oneTimeCredits = concessions.filter((c) => c.metadata?.concessionType === "one_time" || c.concessionType === "one_time");
  const credit = sumBy(oneTimeCredits);
  const petDeposit = Number(item.metadata?.petDeposit) || 0;
  const total = prorated + (Number(item.deposit) || 0) + petDeposit + sumBy(due) - credit;

  const lines = [
    [first?.prorated ? `First month (prorated from ${formatDate(first.from)})` : "First month's rent", prorated],
    ["Security deposit", Number(item.deposit) || 0],
    ...(petDeposit ? [["Pet deposit", petDeposit]] : []),
    ...due.map((c) => [`${c.name}${c.status === "Paid" ? " (paid)" : ""}`, Number(c.amount) || 0]),
    ...oneTimeCredits.map((c) => [`Credit — ${c.name || "Concession"}`, -(Number(c.amount) || 0)]),
  ];

  // Charge unpaid move-in fees to the lease ledger (movein:<lease>:<item> keys make a second click a no-op); rent bills from the schedule.
  const postMoveIn = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    const dims = { leaseId: item.id, tenantId: item.tenantId, unitId: item.unitId, propertyId: item.propertyId };
    const date = moveIn || todayLocalISO();
    const postings = due
      .filter((c) => c.status !== "Paid" && Number(c.amount) > 0)
      .map((c) => ({
        ...dims,
        amount: Number(c.amount),
        date: c.startsOn || date,
        memo: c.name || "Move-in charge",
        incomeKey: "other_income",
        idempotencyKey: `movein:${item.id}:${c.id}`,
      }));
    if (!postings.length) {
      toast.error("Nothing to post — rent bills automatically; add unpaid move-in charges first.");
      return;
    }
    setPosting(true);
    const results = await Promise.all(postings.map((p) => postCharge(p)));
    setPosting(false);
    if (results.some((r) => !r)) {
      toast.error(ledgerErrorMessage() || "Couldn't post every move-in charge.");
      return;
    }
    await onCommitMeta?.({ moveInPostedAt: new Date().toISOString() });
    toast.success(`Posted ${postings.length} move-in charge${postings.length === 1 ? "" : "s"} to the ledger.`);
  };

  return (
    <div className="space-y-6">
      <SectionCard
        title="Due at move-in"
        action={
          <RoleGate allowed={canPost} reason={NO_POST}>
            <Button
              variant="outline"
              size="sm"
              className="border-border bg-surface-card hover:bg-surface-hover"
              disabled={posting || !canPost}
              onClick={postMoveIn}
            >
              {posting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {item.metadata?.moveInPostedAt ? "Post Fees Again (Skips Posted)" : "Post Move-in Fees"}
            </Button>
          </RoleGate>
        }
        description={
          `${
            policies.prorateFirstMonth
              ? `Proration: ${policies.prorationMethod === "thirty" ? "30-day month" : "actual days in month"} (from your rent policies).`
              : "First-month proration is off in your rent policies."
          } The first month's rent bills from the rent schedule when the lease goes live.`
        }
        bodyPadding={false}
      >
        <dl className="divide-y divide-border">
          {lines.map(([label, amount], i) => (
            <div key={i} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
              <dt className="text-text-secondary">{label}</dt>
              <dd className={amount < 0 ? "tabular-nums text-emerald-600 dark:text-emerald-400" : "tabular-nums text-foreground"}>
                {money2(amount)}
              </dd>
            </div>
          ))}
          <div className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
            <dt className="font-semibold text-foreground">Total due</dt>
            <dd className="font-semibold tabular-nums text-foreground">{money2(total)}</dd>
          </div>
        </dl>
      </SectionCard>

      <SectionCard title="One-time move-in charges">
        <ChildRecords
          item={item}
          config={config}
          adapter={moveInAdapter}
          fields={MOVE_IN_FIELDS}
          singular="Move-in charge"
          icon={Receipt}
          defaults={() => ({ name: "Admin fee", status: "Unpaid", startsOn: moveIn || "" })}
          onChange={setCharges}
          emptyDescription="Admin, move-in, key, and non-refundable pet fees collected before move-in."
          summary={(r) => ({
            title: r.name,
            meta: [r.startsOn ? `Due ${formatDate(r.startsOn)}` : null, r.metadata?.refundable ? "Refundable" : null, r.metadata?.memo]
              .filter(Boolean)
              .join(" · "),
            badge: r.status || "Unpaid",
            badgeVariant: r.status === "Paid" ? "success" : r.status === "Waived" ? "neutral" : "warning",
            aside: money2(r.amount),
          })}
        />
      </SectionCard>
    </div>
  );
}

const CONCESSION_FIELDS = [
  { key: "concessionType", label: "Type", type: "select", options: CONCESSION_TYPE_OPTIONS, required: true },
  { key: "name", label: "Description", type: "text", required: true, placeholder: "e.g. Look-and-lease special" },
  { key: "amount", label: "Value", type: "currency", hint: "Dollar value (or the percent for percent-off)." },
  { key: "months", label: "Months applied", type: "number", min: 0 },
  { key: "startsOn", label: "Starts", type: "date" },
  { key: "endsOn", label: "Ends", type: "date" },
  { key: "reason", label: "Reason", type: "text" },
  { key: "approvedBy", label: "Approved by", type: "text" },
  { key: "status", label: "Status", type: "select", options: [{ value: "Active", label: "Active" }, { value: "Used", label: "Used" }, { value: "Expired", label: "Expired" }] },
];

const concessionAdapter = recordItemsAdapter("concession");

export function ConcessionsSection({ item, config }) {
  return (
    <ChildRecords
      item={item}
      config={config}
      adapter={concessionAdapter}
      fields={CONCESSION_FIELDS}
      singular="Concession"
      icon={Tag}
      defaults={(l) => ({ concessionType: "free_month", months: 1, status: "Active", startsOn: l.termStart || "" })}
      emptyDescription="Record specials and credits granted on this lease, so the effective rent is clear."
      summary={(r) => {
        const type = r.metadata?.concessionType || r.concessionType;
        return {
          title: r.name || optionLabel(CONCESSION_TYPE_OPTIONS, type),
          meta: [
            optionLabel(CONCESSION_TYPE_OPTIONS, type),
            r.metadata?.months ? `${r.metadata.months} mo` : null,
            r.startsOn ? `${formatDate(r.startsOn)} – ${formatDate(r.endsOn)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          badge: r.status || "Active",
          badgeVariant: r.status === "Expired" ? "neutral" : "info",
          aside: type === "percent_off" ? `${Number(r.amount) || 0}%` : money2(r.amount),
        };
      }}
    />
  );
}

// --- Deposits ------------------------------------------------------------------

const DEPOSIT_FIELDS = [
  { key: "deposit", label: "Security deposit required", type: "currency" },
  { key: "petDeposit", label: "Pet deposit", type: "currency", meta: true },
  { key: "depositDueDate", label: "Deposit due", type: "date", meta: true },
  { key: "lastMonthRentCollected", label: "Last month's rent collected", type: "switch", meta: true },
];

const HELD_FIELDS = [
  { key: "name", label: "Label", type: "text", required: true },
  { key: "depositKind", label: "Kind", type: "select", options: DEPOSIT_KIND_OPTIONS },
  { key: "amount", label: "Amount", type: "currency", required: true },
  { key: "heldLocation", label: "Held at", type: "text", placeholder: "e.g. Trust account ••4471" },
  { key: "receivedOn", label: "Received on", type: "date" },
  { key: "status", label: "Status", type: "select", options: filterOptions(DEPOSIT_STATUS_MAP).slice(1) },
  { key: "interestBearing", label: "Interest-bearing", type: "switch" },
];

const depositAdapter = layerAdapter(securityDepositsLayer, "leaseId", {
  extra: (l) => ({ ...leaseLinks(l), leaseName: l.name || "" }),
});

const ALT_FIELDS = [
  { key: "depositAltEnabled", label: "Use a deposit alternative", type: "switch", meta: true, full: true },
  { key: "depositAltType", label: "Alternative", type: "select", meta: true, options: DEPOSIT_ALTERNATIVE_OPTIONS, showIf: (i) => i.depositAltEnabled },
  { key: "depositAltProvider", label: "Provider", type: "text", meta: true, showIf: (i) => i.depositAltEnabled },
  { key: "depositAltPolicyNumber", label: "Policy / bond #", type: "text", meta: true, showIf: (i) => i.depositAltEnabled },
  { key: "depositAltCoverage", label: "Coverage amount", type: "currency", meta: true, showIf: (i) => i.depositAltEnabled },
  { key: "depositAltMonthlyFee", label: "Resident monthly fee", type: "currency", meta: true, showIf: (i) => i.depositAltEnabled },
  { key: "depositAltStart", label: "Coverage starts", type: "date", meta: true, showIf: (i) => i.depositAltEnabled },
  { key: "depositAltEnd", label: "Coverage ends", type: "date", meta: true, showIf: (i) => i.depositAltEnabled },
  {
    key: "depositAltStatus",
    label: "Status",
    type: "select",
    meta: true,
    options: [
      { value: "Pending", label: "Pending" },
      { value: "Active", label: "Active" },
      { value: "Claim filed", label: "Claim filed" },
      { value: "Cancelled", label: "Cancelled" },
    ],
    showIf: (i) => i.depositAltEnabled,
  },
];

export function DepositsSection({ item, config, onPatch, onCommit, onCommitMeta }) {
  return (
    <div className="space-y-6">
      <SectionCard title="Deposit terms">
        <FieldsForm item={item} fields={DEPOSIT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
      <SectionCard title="Deposits held" description="Linked Security Deposits records — deductions and refunds are handled there.">
        <ChildRecords
          item={item}
          config={config}
          adapter={depositAdapter}
          fields={HELD_FIELDS}
          singular="Deposit"
          icon={PiggyBank}
          defaults={(l) => ({
            name: `${l.unit || l.name || "Lease"} — security deposit`,
            depositKind: "Security deposit",
            amount: Number(l.deposit) || 0,
            status: "Held",
            receivedOn: todayISO(),
          })}
          emptyDescription="Record the deposit once it's collected so it's tracked through move-out."
          summary={(r) => ({
            title: r.name,
            meta: [r.metadata?.depositKind, r.heldLocation, r.metadata?.receivedOn ? `Received ${formatDate(r.metadata.receivedOn)}` : null]
              .filter(Boolean)
              .join(" · "),
            badge: r.status,
            badgeVariant: DEPOSIT_STATUS_MAP[r.status]?.variant || "neutral",
            aside: currency(r.amount),
          })}
        />
      </SectionCard>
    </div>
  );
}

export function DepositAlternativeSection({ item, onPatch, onCommit, onCommitMeta }) {
  const [busy, setBusy] = useState(false);
  const m = item.metadata || {};
  const fee = Number(m.depositAltMonthlyFee) || 0;

  const bill = async () => {
    setBusy(true);
    const row = await recurringChargesLayer.create({
      id: crypto.randomUUID(),
      name: `Deposit alternative fee${m.depositAltProvider ? ` — ${m.depositAltProvider}` : ""}`,
      amount: fee,
      frequency: "Monthly",
      status: "Active",
      nextDate: m.depositAltStart || item.termStart || todayISO(),
      ...leaseLinks(item),
      leaseId: item.id,
      chargeType: "Deposit alternative",
    });
    setBusy(false);
    if (!row) {
      toast.error("Couldn't create the fee charge.");
      return;
    }
    await onCommitMeta({ depositAltChargeId: row.id });
    toast.success(`Billing ${money2(fee)}/mo as a recurring charge.`);
  };

  return (
    <SectionCard
      title="Deposit alternative"
      description="A surety bond or deposit insurance in place of (or alongside) a cash deposit. Tracked here — no provider is connected."
      action={
        m.depositAltEnabled && fee > 0 && !m.depositAltChargeId ? (
          <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={bill}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Repeat className="h-4 w-4" />} Bill Monthly Fee
          </Button>
        ) : m.depositAltChargeId ? (
          <Badge variant="success">Fee billed monthly</Badge>
        ) : null
      }
    >
      <FieldsForm item={item} fields={ALT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
    </SectionCard>
  );
}
