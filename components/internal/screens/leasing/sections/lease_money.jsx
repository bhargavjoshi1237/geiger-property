"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Loader2, PiggyBank, Receipt, Repeat, Tag, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { effectivePolicies, prorateRent } from "@/lib/policies";
import { glAccountOptions } from "@/lib/supabase/options";
import { layerAdapter, leaseLinks } from "../adapters";
import { MetaRecords } from "./gated";
import {
  BENEFIT_CATALOG,
  CHARGE_TYPE_OPTIONS,
  CONCESSION_TYPE_OPTIONS,
  DEPOSIT_ALTERNATIVE_OPTIONS,
  DEPOSIT_KIND_OPTIONS,
  DEPOSIT_STATUS_MAP,
  FREQUENCY_OPTIONS,
  MOVE_IN_CHARGE_OPTIONS,
  currency,
  filterOptions,
  formatDate,
  metaList,
  money2,
  optionLabel,
  shiftDate,
  sumBy,
  todayISO,
} from "../shared";

// Money tabs of the lease editor: rent & escalations, recurring charges, the
// resident benefits package, move-in costs, concessions, and deposits. Nothing
// here posts to the ledger — charges are schedules the accounting area bills.

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

const RENT_FIELDS = [
  { key: "rent", label: "Monthly rent", type: "currency", required: true },
  { key: "marketRent", label: "Market rent", type: "currency", meta: true, hint: "For loss-to-lease reporting." },
  { key: "firstRentDue", label: "First rent due", type: "date", meta: true },
  { key: "rentNotes", label: "Rent notes", type: "textarea", meta: true, placeholder: "e.g. Rent includes one parking space." },
];

const SCHEDULE_FIELDS = [
  { key: "effectiveDate", label: "Effective date", type: "date", required: true },
  {
    key: "mode",
    label: "Change by",
    type: "select",
    options: [
      { value: "amount", label: "New monthly amount" },
      { value: "percent", label: "Percent increase" },
    ],
    required: true,
  },
  { key: "amount", label: "New monthly rent", type: "currency", showIf: (v) => v.mode !== "percent" },
  { key: "percent", label: "Increase", type: "percent", showIf: (v) => v.mode === "percent" },
  { key: "note", label: "Note", type: "text", full: true, placeholder: "e.g. Year 2 escalation" },
];

// Apply each schedule step in date order → [{ ...row, rent }].
function projectSchedule(baseRent, rows) {
  let rent = Number(baseRent) || 0;
  return [...rows]
    .sort((a, b) => String(a.effectiveDate).localeCompare(String(b.effectiveDate)))
    .map((r) => {
      rent = r.mode === "percent" ? Math.round(rent * (1 + (Number(r.percent) || 0) / 100) * 100) / 100 : Number(r.amount) || rent;
      return { ...r, rent };
    });
}

export function RentSection({ item, config, onPatch, onCommit, onCommitMeta }) {
  const schedule = metaList(item, "rentSchedule");
  const projected = useMemo(() => projectSchedule(item.metadata?.baseRent ?? item.rent, schedule), [item, schedule]);
  const due = projected.filter((r) => !r.appliedOn && r.effectiveDate && r.effectiveDate <= todayISO());

  const applyDue = async () => {
    const last = due[due.length - 1];
    const ids = new Set(due.map((r) => r.id));
    const ok = await onCommit({ rent: last.rent });
    if (!ok) return;
    await onCommitMeta({
      baseRent: item.metadata?.baseRent ?? item.rent,
      rentSchedule: schedule.map((r) => (ids.has(r.id) ? { ...r, appliedOn: todayISO() } : r)),
    });
    toast.success(`Rent updated to ${money2(last.rent)}/mo.`);
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Base rent">
        <FieldsForm item={item} fields={RENT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      <SectionCard
        title="Rent schedule & escalations"
        description="Scheduled increases over the term — a new amount or a percent of the prior rent."
        action={
          due.length ? (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={applyDue}>
              <TrendingUp className="h-4 w-4" /> Apply {due.length} Due
            </Button>
          ) : null
        }
      >
        <MetaRecords
          item={item}
          config={config}
          onCommitMeta={onCommitMeta}
          field="rentSchedule"
          fields={SCHEDULE_FIELDS}
          singular="Escalation"
          icon={TrendingUp}
          defaults={() => ({ mode: "percent", percent: 3, effectiveDate: shiftDate(item.termStart || todayISO(), { years: 1 }) })}
          emptyDescription="Add a scheduled increase, e.g. +3% on each lease anniversary."
          summary={(r) => {
            const p = projected.find((x) => x.id === r.id);
            return {
              title: `From ${formatDate(r.effectiveDate)}`,
              meta: [r.mode === "percent" ? `+${Number(r.percent) || 0}%` : "New amount", r.note].filter(Boolean).join(" · "),
              badge: r.appliedOn ? "Applied" : r.effectiveDate <= todayISO() ? "Due" : "Scheduled",
              badgeVariant: r.appliedOn ? "success" : r.effectiveDate <= todayISO() ? "warning" : "info",
              aside: p ? `${money2(p.rent)}/mo` : null,
            };
          }}
        />
      </SectionCard>
    </div>
  );
}

// --- Recurring charges ----------------------------------------------------------

const CHARGE_FIELDS = [
  { key: "chargeType", label: "Type", type: "select", options: CHARGE_TYPE_OPTIONS, required: true },
  { key: "name", label: "Description", type: "text", required: true, placeholder: "e.g. Parking — space P-12" },
  { key: "amount", label: "Amount", type: "currency", required: true },
  { key: "frequency", label: "Frequency", type: "select", options: FREQUENCY_OPTIONS },
  { key: "nextDate", label: "Next charge date", type: "date" },
  { key: "endsOn", label: "End date", type: "date", hint: "Blank to bill until the lease ends." },
  { key: "account", label: "GL account", type: "relation", load: glAccountOptions },
  {
    key: "status",
    label: "Status",
    type: "select",
    options: [
      { value: "Active", label: "Active" },
      { value: "Paused", label: "Paused" },
      { value: "Ended", label: "Ended" },
    ],
  },
  { key: "prorate", label: "Prorate the first charge", type: "switch" },
  { key: "showInPortal", label: "Show in resident portal", type: "switch" },
  { key: "memo", label: "Memo", type: "text", full: true },
];

const chargeAdapter = layerAdapter(recurringChargesLayer, "leaseId", { extra: leaseLinks });

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
        nextDate: l.termStart || todayISO(),
        showInPortal: true,
      })}
      emptyDescription="Add pet rent, parking, storage, utilities, and other charges billed with rent."
      summary={(r) => ({
        title: r.name || r.chargeType || "Charge",
        meta: [r.chargeType, r.frequency || "Monthly", r.nextDate ? `Next ${formatDate(r.nextDate)}` : null, r.account]
          .filter(Boolean)
          .join(" · "),
        badge: r.status || "Active",
        badgeVariant: r.status === "Active" || !r.status ? "success" : "neutral",
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
      amount: total,
      frequency: "Monthly",
      status: "Active",
      nextDate: pkg.startsOn || item.termStart || todayISO(),
      ...leaseLinks(item),
      leaseId: item.id,
      metadata: { chargeType: "Resident benefits package", benefits: included.map((b) => b.label) },
    };
    const row = pkg.chargeId
      ? await recurringChargesLayer.update(pkg.chargeId, values)
      : await recurringChargesLayer.create({ id: crypto.randomUUID(), ...values });
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
                  className="bg-surface-card pl-7 text-right tabular-nums"
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

  useEffect(() => {
    let alive = true;
    Promise.all([listRecordItems("lease", item.id, "move_in_charge"), listRecordItems("lease", item.id, "concession")]).then(
      ([c, k]) => {
        if (!alive) return;
        setCharges(c ?? []);
        setConcessions(k ?? []);
      },
    );
    return () => {
      alive = false;
    };
  }, [item.id]);

  if (!policies || charges === null) return <ListLoading label="Loading move-in costs" className="py-10" />;

  const moveIn = item.moveInDate || item.termStart;
  const rent = Number(item.rent) || 0;
  const prorated = prorateRent(policies, rent, moveIn);
  const due = charges.filter((c) => c.status !== "Waived");
  const oneTimeCredits = concessions.filter((c) => c.metadata?.concessionType === "one_time" || c.concessionType === "one_time");
  const credit = sumBy(oneTimeCredits);
  const petDeposit = Number(item.metadata?.petDeposit) || 0;
  const total = prorated + (Number(item.deposit) || 0) + petDeposit + sumBy(due) - credit;

  const lines = [
    [
      policies.prorateFirstMonth && moveIn ? `First month (prorated from ${formatDate(moveIn)})` : "First month's rent",
      prorated,
    ],
    ["Security deposit", Number(item.deposit) || 0],
    ...(petDeposit ? [["Pet deposit", petDeposit]] : []),
    ...due.map((c) => [`${c.name}${c.status === "Paid" ? " (paid)" : ""}`, Number(c.amount) || 0]),
    ...oneTimeCredits.map((c) => [`Credit — ${c.name || "Concession"}`, -(Number(c.amount) || 0)]),
  ];

  // Charge first-month rent and unpaid move-in fees to the lease ledger. Idempotency
  // keys make a second click a no-op for anything already posted.
  const postMoveIn = async () => {
    if (!canPost) {
      toast.error(NO_POST);
      return;
    }
    const dims = { leaseId: item.id, tenantId: item.tenantId, unitId: item.unitId, propertyId: item.propertyId };
    const date = moveIn || todayLocalISO();
    const postings = [
      prorated > 0 && { ...dims, amount: prorated, date, memo: "First month's rent", idempotencyKey: `movein:${item.id}:rent` },
      ...due
        .filter((c) => c.status !== "Paid" && Number(c.amount) > 0)
        .map((c) => ({
          ...dims,
          amount: Number(c.amount),
          date: c.startsOn || date,
          memo: c.name || "Move-in charge",
          incomeKey: "other_income",
          idempotencyKey: `movein:${item.id}:${c.id}`,
        })),
    ].filter(Boolean);
    if (!postings.length) {
      toast.error("Nothing to post — add rent or move-in charges first.");
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
              {item.metadata?.moveInPostedAt ? "Post Again (Skips Posted)" : "Post to Ledger"}
            </Button>
          </RoleGate>
        }
        description={
          policies.prorateFirstMonth
            ? `Proration: ${policies.prorationMethod === "thirty" ? "30-day month" : "actual days in month"} (from your rent policies).`
            : "First-month proration is off in your rent policies."
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
      metadata: { chargeType: "Deposit alternative" },
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
