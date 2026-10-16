"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, CheckCircle2, Circle, Users, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SectionCard, StatGrid } from "@/components/internal/shared/screen_kit";
import { listLeaseParties } from "@/lib/supabase/lease_parties";
import { recurringChargesLayer } from "@/lib/supabase/recurring_charges";
import { Callout } from "./gated";
import {
  currency,
  daysUntil,
  formatDate,
  isLiveLease,
  optionLabel,
  partyRoleLabel,
  LEASE_TYPE_OPTIONS,
  TERM_TYPE_OPTIONS,
} from "../shared";

// Lease overview: KPIs, readiness checklist, key dates, and lifecycle flags.

function remainingLabel(item) {
  if (item.termType === "mtm" || item.status === "Month-to-month") return "Month-to-month";
  const d = daysUntil(item.termEnd);
  if (d === null) return "—";
  return d < 0 ? "Ended" : `${d} days`;
}

export function LeaseOverviewSection({ item, onNavigate, runAction }) {
  const [parties, setParties] = useState(null);
  const [charges, setCharges] = useState(null);
  const m = item.metadata || {};

  useEffect(() => {
    let alive = true;
    Promise.all([listLeaseParties(item.id), recurringChargesLayer.list({ leaseId: item.id })]).then(([p, c]) => {
      if (!alive) return;
      setParties(p ?? []);
      setCharges(c ?? []);
    });
    return () => {
      alive = false;
    };
  }, [item.id]);

  const chargeTotal = (charges || [])
    .filter((c) => c.status !== "Inactive" && (c.frequency || "Monthly") === "Monthly")
    .reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const people = parties || [];
  const tenants = people.filter((p) => p.role === "tenant");

  const stats = [
    {
      label: "Monthly rent",
      value: currency(item.rent),
      hint: chargeTotal ? `+ ${currency(chargeTotal)} recurring charges` : "Base rent",
      icon: Wallet,
    },
    {
      label: "Days remaining",
      value: remainingLabel(item),
      hint: item.termEnd ? `Ends ${formatDate(item.termEnd)}` : "No end date",
      icon: CalendarDays,
    },
    {
      label: "Status",
      value: item.status || "Draft",
      hint: `${optionLabel(LEASE_TYPE_OPTIONS, item.leaseType || "residential")} · ${optionLabel(TERM_TYPE_OPTIONS, item.termType || "fixed")}`,
    },
    {
      label: "Parties",
      value: parties === null ? "…" : String(people.length || (item.tenantId ? 1 : 0)),
      hint: tenants.length ? `${tenants.length} tenant${tenants.length === 1 ? "" : "s"}` : item.tenantName || "No tenant linked",
      icon: Users,
    },
  ];

  const steps = [
    { done: Boolean(item.unitId), label: "Link the unit", section: "premises" },
    { done: Boolean(item.tenantId) || tenants.length > 0, label: "Add the tenants", section: "people" },
    { done: Boolean(item.termStart && (item.termEnd || item.termType === "mtm")), label: "Set the term dates", section: "terms" },
    { done: Number(item.rent) > 0, label: "Set the rent", section: "rent" },
    { done: Number(item.deposit) > 0 || Boolean(m.depositAltEnabled), label: "Record the deposit", section: "deposits" },
    { done: Boolean(item.templateId), label: "Pick a lease template", section: "document" },
    { done: Boolean(m.lastDocumentAt), label: "Generate the lease document", section: "document" },
    { done: Boolean(item.signedDate), label: "Record signatures", section: "esign" },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  const dates = [
    ["Signed", item.signedDate],
    ["Move-in", item.moveInDate],
    ["Term start", item.termStart],
    ["Term end", item.termEnd],
    ["Notice given", item.noticeDate],
    ["Move-out", item.moveOutDate],
  ];

  return (
    <div className="space-y-5">
      {m.evictionActive ? (
        <Callout
          tone="danger"
          action={
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => onNavigate("eviction")}>
              Open eviction <ArrowRight className="h-4 w-4" />
            </Button>
          }
        >
          Eviction in progress{m.evictionStage ? ` — ${m.evictionStage}` : ""}. Online payments follow the
          &ldquo;stop payments once an eviction is filed&rdquo; policy.
        </Callout>
      ) : null}
      {item.status === "Notice given" ? (
        <Callout tone="warning">
          Notice to vacate given{item.noticeDate ? ` on ${formatDate(item.noticeDate)}` : ""} — moving out{" "}
          {item.moveOutDate ? formatDate(item.moveOutDate) : "on a date not yet set"}.
        </Callout>
      ) : null}
      {m.renewedFromName ? (
        <Callout tone="info">Renewal of &ldquo;{m.renewedFromName}&rdquo;.</Callout>
      ) : null}

      <StatGrid stats={stats} />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Readiness"
          description={`${doneCount} of ${steps.length} steps complete`}
          action={
            !isLiveLease(item) && item.status !== "Renewed" && item.status !== "Ended" ? (
              <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("activate")}>
                Activate
              </Button>
            ) : null
          }
          bodyPadding={false}
        >
          <ul className="divide-y divide-border">
            {steps.map((s) => (
              <li key={s.label}>
                <button
                  type="button"
                  onClick={() => onNavigate(s.section)}
                  className="flex w-full items-center justify-between gap-3 px-5 py-2.5 text-left text-sm transition-colors hover:bg-surface-hover"
                >
                  <span className="flex items-center gap-2.5">
                    {s.done ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4 text-text-tertiary" />
                    )}
                    <span className={s.done ? "text-text-secondary" : "text-foreground"}>{s.label}</span>
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-text-tertiary" />
                </button>
              </li>
            ))}
          </ul>
        </SectionCard>

        <SectionCard title="Key dates" bodyPadding={false}>
          <dl className="divide-y divide-border">
            {dates.map(([label, v]) => (
              <div key={label} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <dt className="text-text-secondary">{label}</dt>
                <dd className={v ? "font-medium text-foreground" : "text-text-tertiary"}>{formatDate(v)}</dd>
              </div>
            ))}
          </dl>
        </SectionCard>
      </div>

      <SectionCard
        title="People on this lease"
        action={
          <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => onNavigate("people")}>
            Manage
          </Button>
        }
        bodyPadding={false}
      >
        {people.length ? (
          <ul className="divide-y divide-border">
            {people.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                <span className="truncate text-foreground">{p.name || "Unnamed"}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {p.isPrimary ? <Badge variant="success">Primary</Badge> : null}
                  <Badge variant="neutral">{partyRoleLabel(p.role)}</Badge>
                  {Number(p.responsibilityPct) ? (
                    <span className="text-xs tabular-nums text-text-secondary">{Number(p.responsibilityPct)}%</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-4 text-sm text-text-secondary">
            {item.tenantName ? `${item.tenantName} (primary tenant).` : "No one is on this lease yet."} Add co-tenants,
            co-signers, guarantors, and occupants in People.
          </p>
        )}
      </SectionCard>
    </div>
  );
}

export default LeaseOverviewSection;
