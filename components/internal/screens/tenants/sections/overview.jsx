"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  CalendarClock,
  CalendarRange,
  Ban,
  Home,
  Languages,
  Mail,
  MessageSquare,
  Phone,
  Smartphone,
  TrendingUp,
  Umbrella,
  Wallet,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { SectionCard, StatGrid, StatusPill } from "@/components/internal/shared/screen_kit";
import { AttentionList, GlanceGrid, LinkRows, attentionSummary } from "@/components/internal/shared/overview_kit";
import { listRecordItems } from "@/lib/supabase/record_items";
import { COMPLIANCE_STATUS_MAP, complianceOf, daysUntil } from "@/lib/compliance";
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

// Lease countdown tile: days left, "Today", "Ended", or "—" when no end date is on file.
function leaseCountdown(leaseEnd) {
  const days = daysUntil(leaseEnd);
  if (days === null) return { value: "—", hint: "No lease end on file" };
  if (days < 0) return { value: "Ended", hint: formatDate(leaseEnd) };
  if (days === 0) return { value: "Today", hint: "Lease ends today" };
  return { value: String(days), hint: `days left · ends ${formatDate(leaseEnd)}` };
}

// Tenant snapshot in the event-overview layout: KPI tiles, follow-ups, contact facts, then programs & access.
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
  const balance = Number(item.balance) || 0;
  const insurance = policies ? complianceOf(policies, { required: insuranceRequired(item) }) : null;
  const restrictions = activeRestrictions(item);
  const portal = portalStatusOf(item);
  const idDays = daysUntil(m.idExpiresOn);
  const lease = leaseCountdown(item.leaseEnd);

  const attention = [
    insurance && ["missing", "expired"].includes(insurance.state)
      ? { key: "ins", label: `Renters insurance ${insurance.state === "missing" ? "missing" : "expired"}`, tone: "danger", section: "insurance" }
      : null,
    insurance?.state === "expiring"
      ? { key: "ins-soon", label: "Renters insurance expiring soon", detail: `Expires ${formatDate(insurance.soonest)}`, tone: "warning", section: "insurance" }
      : null,
    balance > 0 ? { key: "balance", label: `Balance due ${currency(balance)}`, detail: "Open charges on the ledger", tone: "danger", section: "payments" } : null,
    restrictions.length
      ? { key: "restrict", label: "Payment restrictions in place", detail: restrictions.map((r) => r.label).join(", "), tone: "warning", section: "restrictions" }
      : null,
    m.doNotContact ? { key: "dnc", label: "Marked do not contact", tone: "warning", section: "communication" } : null,
    idDays !== null && idDays < 0 ? { key: "id", label: "Government ID on file has expired", tone: "warning", section: "identification" } : null,
  ].filter(Boolean);

  const stats = [
    {
      label: "Balance",
      value: currency(balance),
      icon: Wallet,
      tone: balance > 0 ? "danger" : undefined,
      hint: balance > 0 ? "Due now" : "Paid up",
      onClick: () => onNavigate("payments"),
    },
    {
      label: "Monthly rent",
      value: m.rentAmount ? currency(m.rentAmount) : "—",
      icon: Home,
      hint: item.unit ? `Unit ${item.unit}${m.propertyName ? ` · ${m.propertyName}` : ""}` : "No unit assigned",
      onClick: () => onNavigate("lease"),
    },
    { label: "Lease ends", value: lease.value, icon: CalendarClock, hint: lease.hint, onClick: () => onNavigate("lease") },
    {
      label: "Open items",
      value: String(attention.length),
      icon: AlertTriangle,
      tone: attention.length ? "warning" : undefined,
      hint: attention.length ? "Need follow-up" : "All clear",
    },
  ];

  const term = item.leaseStart || item.leaseEnd ? `${formatDate(item.leaseStart)} – ${formatDate(item.leaseEnd)}` : "";

  return (
    <div className="space-y-8">
      <StatGrid stats={stats} />

      <SectionCard bare title="Needs attention" description={attentionSummary(attention)}>
        <AttentionList items={attention} onNavigate={onNavigate} emptyText="Nothing needs attention on this tenant's file." />
      </SectionCard>

      <SectionCard bare title="At a glance" action={<StatusPill status={item.status} map={TENANT_STATUS_MAP} />}>
        <GlanceGrid
          rows={[
            { key: "email", icon: Mail, value: item.email, empty: "No email on file" },
            { key: "phone", icon: Phone, value: item.phone, empty: "No phone on file" },
            { key: "unit", icon: Home, value: item.unit ? [`Unit ${item.unit}`, m.propertyName].filter(Boolean).join(" · ") : "", empty: "No unit assigned" },
            { key: "term", icon: CalendarRange, value: term, empty: "No lease term set" },
            { key: "channel", icon: MessageSquare, prefix: "Prefers", value: m.preferredContact, empty: "No preferred channel" },
            { key: "language", icon: Languages, value: m.language, empty: "No language set" },
            { key: "employer", icon: Briefcase, value: m.employer, empty: "No employer on file" },
          ]}
        />
      </SectionCard>

      <SectionCard bare title="Programs & access" description="Portal access, insurance and reporting enrollment.">
        <LinkRows
          onNavigate={onNavigate}
          rows={[
            {
              key: "portal",
              icon: Smartphone,
              title: "Resident portal",
              description: "Online payments, requests and documents.",
              control: <StatusPill status={portal} map={PORTAL_STATUS_MAP} />,
              section: "portal",
            },
            {
              key: "insurance",
              icon: Umbrella,
              title: "Renters insurance",
              description: insurance?.soonest ? `Soonest expiry ${formatDate(insurance.soonest)}` : "Policies on file and compliance.",
              control: insurance ? (
                <StatusPill status={insurance.state} map={COMPLIANCE_STATUS_MAP} />
              ) : (
                <span className="text-xs text-text-tertiary">Checking…</span>
              ),
              section: "insurance",
            },
            {
              key: "reporting",
              icon: TrendingUp,
              title: "Rent reporting",
              description: "Credit-bureau reporting of on-time rent.",
              control: <StatusPill status={m.rentReportingStatus || "Not enrolled"} map={RENT_REPORTING_STATUS_MAP} />,
              section: "rentReporting",
            },
            {
              key: "restrictions",
              icon: Ban,
              title: "Payment restrictions",
              description: restrictions.length ? restrictions.map((r) => r.label).join(", ") : "Every payment method is allowed.",
              control: restrictions.length ? (
                <Badge variant="danger">{restrictions.length} active</Badge>
              ) : (
                <Badge variant="outline">None</Badge>
              ),
              section: "restrictions",
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}

export default TenantOverviewSection;
