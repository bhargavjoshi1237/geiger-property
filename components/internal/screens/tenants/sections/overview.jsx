"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { listRecordItems } from "@/lib/supabase/record_items";
import { COMPLIANCE_STATUS_MAP, complianceOf, daysUntil } from "@/lib/compliance";
import { MiniStat } from "@/components/internal/screens/people/notice";
import { PORTAL_STATUS_MAP } from "@/components/internal/screens/people/shared";
import {
  RENT_REPORTING_STATUS_MAP,
  TENANT_STATUS_MAP,
  activeRestrictions,
  currency,
  formatDate,
  insuranceRequired,
  portalStatusOf,
} from "../shared";

// Tenant snapshot: key facts, compliance, portal, and anything needing attention.
export function TenantOverviewSection({ item, config, onNavigate }) {
  const [policies, setPolicies] = useState(null);

  useEffect(() => {
    let alive = true;
    listRecordItems(config.key, item.id, "insurance_policy").then((r) => alive && setPolicies(r ?? []));
    return () => {
      alive = false;
    };
  }, [config.key, item.id]);

  const m = item.metadata || {};
  const insurance = policies ? complianceOf(policies, { required: insuranceRequired(item) }) : null;
  const restrictions = activeRestrictions(item);
  const portal = portalStatusOf(item);
  const idDays = daysUntil(m.idExpiresOn);

  const attention = [
    insurance && ["missing", "expired"].includes(insurance.state)
      ? { text: `Renters insurance ${insurance.state === "missing" ? "missing" : "expired"}`, to: "insurance" }
      : null,
    insurance?.state === "expiring" ? { text: `Renters insurance expires ${formatDate(insurance.soonest)}`, to: "insurance" } : null,
    Number(item.balance) > 0 ? { text: `Balance due ${currency(item.balance)}`, to: "payments" } : null,
    restrictions.length ? { text: `Payment restrictions: ${restrictions.map((r) => r.label).join(", ")}`, to: "restrictions" } : null,
    m.doNotContact ? { text: "Marked do not contact", to: "communication" } : null,
    idDays !== null && idDays < 0 ? { text: "Government ID on file has expired", to: "identification" } : null,
  ].filter(Boolean);

  const term = item.leaseStart || item.leaseEnd ? `${formatDate(item.leaseStart)} – ${formatDate(item.leaseEnd)}` : "—";

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <MiniStat label="Status">
            <StatusPill status={item.status} map={TENANT_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Unit">{item.unit || "—"}</MiniStat>
          <MiniStat label="Lease term">{term}</MiniStat>
          <MiniStat label="Balance">
            <span className={Number(item.balance) > 0 ? "font-semibold text-red-600 dark:text-red-400" : "font-semibold"}>
              {currency(item.balance)}
            </span>
          </MiniStat>
          <MiniStat label="Renters insurance">
            {insurance ? <StatusPill status={insurance.state} map={COMPLIANCE_STATUS_MAP} /> : "Checking…"}
          </MiniStat>
          <MiniStat label="Portal">
            <StatusPill status={portal} map={PORTAL_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Email">{item.email || "—"}</MiniStat>
          <MiniStat label="Phone">{item.phone || "—"}</MiniStat>
          <MiniStat label="Preferred channel">{m.preferredContact || "—"}</MiniStat>
          <MiniStat label="Language">{m.language || "—"}</MiniStat>
          <MiniStat label="Rent reporting">
            <StatusPill status={m.rentReportingStatus || "Not enrolled"} map={RENT_REPORTING_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Employer">{m.employer || "—"}</MiniStat>
        </div>
      </SectionCard>

      <SectionCard title="Needs attention" description="Open items on this tenant's file.">
        {attention.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-text-secondary">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" /> Nothing needs attention.
          </p>
        ) : (
          <ul className="space-y-2">
            {attention.map((a) => (
              <li key={a.text}>
                <button
                  type="button"
                  onClick={() => onNavigate(a.to)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-foreground transition-colors hover:bg-surface-hover"
                >
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                  {a.text}
                </button>
              </li>
            ))}
          </ul>
        )}
        {restrictions.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {restrictions.map((r) => (
              <Badge key={r.key} variant="danger">
                {r.label}
              </Badge>
            ))}
          </div>
        ) : null}
      </SectionCard>
    </div>
  );
}

export default TenantOverviewSection;
