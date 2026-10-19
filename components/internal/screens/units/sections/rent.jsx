"use client";

import { BadgeDollarSign, History, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { DataTable, EmptyState, SectionCard } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { currency, formatDate, toOptions } from "../shared";

// Unit · Rent & pricing — market rent (changed through the wizard so history is
// kept), fees, concessions, and the dated market-rent history (metadata.rentHistory).

const CONCESSIONS = toOptions(["None", "Free weeks", "Monthly discount", "First month off", "Waived fees"]);
const TERMS = toOptions(["Month-to-month", "3 months", "6 months", "9 months", "12 months", "18 months", "24 months"]);
const hasConcession = (u) => u.concessionType && u.concessionType !== "None";

const FIELDS = [
  { key: "pricing", label: "Pricing", type: "heading" },
  {
    key: "rent",
    label: "Market rent",
    type: "readonly",
    format: (v) => `${currency(v)}/mo`,
    hint: "Use “Change market rent” to update it and keep history.",
  },
  { key: "deposit", label: "Security deposit", type: "currency" },
  { key: "minRent", label: "Floor rent", type: "currency", meta: true, hint: "Lowest rent you'll accept." },
  { key: "maxRent", label: "Ceiling rent", type: "currency", meta: true },
  { key: "preferentialRent", label: "Preferential rent", type: "switch", meta: true, hint: "A below-market rent offered to the current resident." },
  { key: "preferentialAmount", label: "Preferential amount", type: "currency", meta: true, showIf: (u) => Boolean(u.preferentialRent) },
  { key: "leaseTerms", label: "Lease terms offered", type: "multiselect", options: TERMS, meta: true },
  { key: "shortTermPremiumPct", label: "Short-term premium", type: "percent", meta: true, hint: "Added to rent for terms under 12 months." },
  { key: "fees", label: "Fees", type: "heading" },
  { key: "applicationFee", label: "Application fee", type: "currency", meta: true },
  { key: "adminFee", label: "Admin / move-in fee", type: "currency", meta: true },
  { key: "petRent", label: "Pet rent", type: "currency", meta: true, suffix: "/mo" },
  { key: "petDeposit", label: "Pet deposit", type: "currency", meta: true },
  { key: "parkingFee", label: "Parking fee", type: "currency", meta: true, suffix: "/mo" },
  { key: "storageFee", label: "Storage fee", type: "currency", meta: true, suffix: "/mo" },
  { key: "concessions", label: "Concessions", type: "heading" },
  { key: "concessionType", label: "Concession", type: "select", options: CONCESSIONS, meta: true },
  { key: "concessionValue", label: "Concession value", type: "currency", meta: true, showIf: hasConcession },
  { key: "concessionEndsOn", label: "Offer ends", type: "date", meta: true, showIf: hasConcession },
  { key: "concessionNotes", label: "Concession terms", type: "textarea", meta: true, showIf: hasConcession },
  { key: "pricingNotes", label: "Pricing notes", type: "textarea", meta: true },
];

export function UnitRentSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const history = Array.isArray(item.rentHistory) ? item.rentHistory : [];
  const rows = [...history].sort((a, b) => String(b.effectiveDate).localeCompare(String(a.effectiveDate)));

  const remove = async (row) => {
    const ok = await onCommitMeta({ rentHistory: history.filter((h) => h.id !== row.id) });
    if (ok) toast.success("Removed history entry.");
  };

  const columns = [
    { key: "effectiveDate", header: "Effective", render: (r) => formatDate(r.effectiveDate) },
    {
      key: "amount",
      header: "Rent",
      align: "right",
      className: "text-right font-semibold tabular-nums text-foreground",
      render: (r) => currency(r.amount),
    },
    {
      key: "change",
      header: "Change",
      align: "right",
      className: "text-right tabular-nums",
      render: (r) => {
        const d = (Number(r.amount) || 0) - (Number(r.previous) || 0);
        if (!r.previous) return <span className="text-text-tertiary">—</span>;
        return (
          <span className={d >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
            {d >= 0 ? "+" : "−"}
            {currency(Math.abs(d))}
          </span>
        );
      },
    },
    { key: "reason", header: "Reason", className: "text-sm text-text-secondary", render: (r) => r.reason || "—" },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (r) => (
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-red-600 dark:text-red-300 hover:bg-red-500/10"
          onClick={() => remove(r)}
          aria-label="Remove entry"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <SectionCard
        title="Rent & fees"
        action={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" size="sm" onClick={() => runAction("changeRent")}>
            <BadgeDollarSign className="h-4 w-4" /> Change Market Rent
          </Button>
        }
      >
        <FieldsForm item={item} fields={FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      <SectionCard title="Market rent history" description="Every recorded market-rent change, newest first." bodyPadding={false}>
        {rows.length ? (
          <DataTable columns={columns} data={rows} getRowKey={(r) => r.id} className="rounded-none border-0" />
        ) : (
          <EmptyState
            icon={History}
            title="No rent changes yet"
            description="Use “Change market rent” to record the first entry."
          />
        )}
      </SectionCard>
    </div>
  );
}

export default UnitRentSection;
