"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  Clock,
  FileCheck,
  Mail,
  MailPlus,
  Phone,
  Power,
  ShieldCheck,
  Smartphone,
  Star,
  UserRound,
  Wallet,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { SectionCard, StatGrid, StatusPill } from "@/components/internal/shared/screen_kit";
import { AttentionList, GlanceGrid, LinkRows, attentionSummary } from "@/components/internal/shared/overview_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords, recordItemsAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { makeComplianceSection } from "@/components/internal/screens/people/compliance_records";
import { InfoNotice, MiniStat } from "@/components/internal/screens/people/notice";
import { listRecordItems } from "@/lib/supabase/record_items";
import { portalAddress } from "@/lib/portal/staff_api";
import { PORTAL_STATUS_MAP } from "@/components/internal/screens/people/shared";
import { COMPLIANCE_STATUS_MAP, complianceOf, worstCompliance } from "@/lib/compliance";
import {
  COI_FIELDS,
  LICENSE_FIELDS,
  REVIEW_FIELDS,
  VENDOR_PORTAL_FIELDS,
  VENDOR_REQUIREMENT_FIELDS,
  VENDOR_STATUS_MAP,
  coiRequired,
  currency,
  formatDate,
  isPreferred,
  licenseRequired,
  needsW9,
  tradesOf,
} from "./shared";

// Legacy vendors carry only the `insurance_expiry` column; treat it as one COI.
export const coiRowsOf = (vendor, rows) =>
  rows.length || !vendor?.insuranceExpiry ? rows : [{ id: "legacy", endsOn: vendor.insuranceExpiry, status: "Active" }];

// Overall compliance for a vendor from its COI + license records.
export function vendorCompliance(vendor, cois, licenses) {
  const coi = complianceOf(coiRowsOf(vendor, cois || []), { required: coiRequired(vendor) });
  const license = complianceOf(licenses || [], { required: licenseRequired(vendor) });
  return { coi, license, state: worstCompliance(coi.state, license.state) };
}

// Keep the legacy `insurance_expiry` column on the soonest in-force COI so
// lists and other areas that read it stay accurate.
export function insuranceExpiryFrom(rows) {
  const live = (rows || []).filter((r) => String(r.status || "").toLowerCase() !== "cancelled" && r.endsOn);
  return complianceOf(live).soonest || live.map((r) => r.endsOn).sort().pop() || "";
}

function syncInsuranceExpiry(rows, { item, onCommit }) {
  const next = insuranceExpiryFrom(rows);
  if ((item.insuranceExpiry || "") !== next) onCommit({ insuranceExpiry: next });
}

const remountKey = (props) => props.item.metadata?.lastComplianceChangeAt || "records";

const CoiRecords = makeComplianceSection({
  kind: "insurance_policy",
  fields: COI_FIELDS,
  singular: "Certificate",
  plural: "Certificates",
  icon: ShieldCheck,
  heading: "Certificates of insurance",
  required: coiRequired,
  defaults: () => ({ status: "Active", policyType: "General liability" }),
  title: (r) => [r.policyType, r.name].filter(Boolean).join(" · "),
  meta: (r) =>
    [r.policyNumber, `Expires ${formatDate(r.endsOn)}`, r.additionalInsured ? "Additional insured" : null].filter(Boolean).join(" · "),
  aside: (r) => (Number(r.amount) ? currency(r.amount) : undefined),
  note: (item, required) =>
    required
      ? `Required for active vendors${item.metadata?.coiMinGeneralLiability ? ` · min ${currency(item.metadata.coiMinGeneralLiability)} general liability` : ""}. Expiring certificates show here 30 days out.`
      : "Not required for this vendor.",
  onSync: syncInsuranceExpiry,
});

const LicenseRecords = makeComplianceSection({
  kind: "license",
  fields: LICENSE_FIELDS,
  singular: "License",
  plural: "Licenses",
  icon: BadgeCheck,
  heading: "Trade licenses",
  required: licenseRequired,
  defaults: () => ({ status: "Active" }),
  title: (r) => [r.name, r.number].filter(Boolean).join(" · "),
  meta: (r) => [r.state, r.classification, `Expires ${formatDate(r.endsOn)}`].filter(Boolean).join(" · "),
  note: (_item, required) =>
    required ? "A current license is required for this vendor." : "Optional — turn on “Require a trade license” in Compliance.",
});

export const VendorCoiSection = (props) => <CoiRecords key={remountKey(props)} {...props} />;
export const VendorLicenseSection = (props) => <LicenseRecords key={remountKey(props)} {...props} />;

// Hook: load this vendor's COI + license rows (keyed so wizards can refresh it).
function useVendorCompliance(item, config) {
  const [state, setState] = useState(null);
  const key = item.metadata?.lastComplianceChangeAt;
  useEffect(() => {
    let alive = true;
    Promise.all([
      listRecordItems(config.key, item.id, "insurance_policy"),
      listRecordItems(config.key, item.id, "license"),
    ]).then(([cois, licenses]) => alive && setState({ cois: cois ?? [], licenses: licenses ?? [] }));
    return () => {
      alive = false;
    };
  }, [config.key, item.id, key]);
  return state ? vendorCompliance(item, state.cois, state.licenses) : null;
}

// Compliance overview: overall status, per-requirement status, and requirement settings.
export function VendorComplianceSection({ item, config, onPatch, onCommit, onCommitMeta, onNavigate }) {
  const c = useVendorCompliance(item, config);
  const w9 = item.metadata?.is1099 ? (item.metadata?.w9OnFile ? "compliant" : "missing") : "not_required";
  const rows = [
    { label: "Insurance (COI)", state: c?.coi.state, detail: c?.coi.soonest ? `Next expiry ${formatDate(c.coi.soonest)}` : null, to: "insurance" },
    { label: "Trade license", state: c?.license.state, detail: c?.license.soonest ? `Next expiry ${formatDate(c.license.soonest)}` : null, to: "licenses" },
    { label: "W-9", state: w9, detail: item.metadata?.w9ReceivedOn ? `Received ${formatDate(item.metadata.w9ReceivedOn)}` : null, to: "tax" },
  ];
  return (
    <div className="space-y-4">
      <SectionCard
        title="Compliance status"
        description="Vendors with missing or expired items shouldn't be assigned new work."
        action={c ? <StatusPill status={worstCompliance(c.state, w9)} map={COMPLIANCE_STATUS_MAP} /> : null}
        bodyPadding={false}
      >
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.label}>
              <button
                type="button"
                onClick={() => onNavigate(r.to)}
                className="flex w-full items-center justify-between gap-3 px-5 py-3 text-left transition-colors hover:bg-surface-hover"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">{r.label}</span>
                  {r.detail ? <span className="text-xs text-text-secondary">{r.detail}</span> : null}
                </span>
                {r.state ? <StatusPill status={r.state} map={COMPLIANCE_STATUS_MAP} /> : <span className="text-sm text-text-tertiary">Checking…</span>}
              </button>
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="Requirements">
        <FieldsForm item={item} fields={VENDOR_REQUIREMENT_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
    </div>
  );
}

// Snapshot: profile, rates, compliance, and attention items.
export function VendorOverviewSection({ item, config, onNavigate }) {
  const c = useVendorCompliance(item, config);
  const m = item.metadata || {};
  const trades = tradesOf(item);
  const attention = [
    c && ["missing", "expired"].includes(c.coi.state)
      ? { key: "coi", label: `Insurance certificate ${c.coi.state}`, tone: "danger", section: "insurance" }
      : null,
    c?.coi.state === "expiring"
      ? { key: "coi-soon", label: "Insurance expiring soon", detail: `Expires ${formatDate(c.coi.soonest)}`, tone: "warning", section: "insurance" }
      : null,
    c && ["missing", "expired"].includes(c.license.state)
      ? { key: "lic", label: `Trade license ${c.license.state}`, tone: "danger", section: "licenses" }
      : null,
    c?.license.state === "expiring"
      ? { key: "lic-soon", label: "License expiring soon", detail: `Expires ${formatDate(c.license.soonest)}`, tone: "warning", section: "licenses" }
      : null,
    needsW9(item) ? { key: "w9", label: "W-9 not on file", detail: "Needed for 1099 reporting.", tone: "warning", section: "tax" } : null,
    m.holdPayments ? { key: "hold", label: "Payments on hold", detail: m.holdReason, tone: "danger", section: "payment" } : null,
    item.status === "Do not use" ? { key: "dnu", label: "Marked do not use", detail: m.doNotUseReason, tone: "danger", section: "company" } : null,
  ].filter(Boolean);

  const stats = [
    {
      label: "Rating",
      value: Number(item.rating) ? Number(item.rating).toFixed(1) : "—",
      icon: Star,
      hint: Number(item.rating) ? "Out of 5" : "Not rated yet",
      onClick: () => onNavigate("reviews"),
    },
    {
      label: "Hourly rate",
      value: Number(item.hourlyRate) ? currency(item.hourlyRate) : "—",
      icon: Wallet,
      hint: Number(m.tripCharge) ? `${currency(m.tripCharge)} trip charge` : "No trip charge",
      onClick: () => onNavigate("rates"),
    },
    {
      label: "Compliance",
      value: c ? COMPLIANCE_STATUS_MAP[c.state]?.label || c.state : "…",
      icon: ShieldCheck,
      hint: "Insurance + licenses",
      onClick: () => onNavigate("compliance"),
    },
    {
      label: "Open items",
      value: String(attention.length),
      icon: AlertTriangle,
      tone: attention.length ? "warning" : undefined,
      hint: attention.length ? "Need follow-up" : "All clear",
    },
  ];

  return (
    <div className="space-y-8">
      <StatGrid stats={stats} />

      <SectionCard bare title="Needs attention" description={attentionSummary(attention)}>
        <AttentionList items={attention} onNavigate={onNavigate} emptyText="Nothing needs attention on this vendor." />
      </SectionCard>

      <SectionCard
        bare
        title="At a glance"
        action={
          <div className="flex items-center gap-2">
            {isPreferred(item) && item.status !== "Preferred" ? <Badge variant="purple">Preferred</Badge> : null}
            <StatusPill status={item.status} map={VENDOR_STATUS_MAP} />
          </div>
        }
      >
        <GlanceGrid
          rows={[
            { key: "contact", icon: UserRound, value: item.contactName, empty: "No contact person" },
            { key: "phone", icon: Phone, value: item.phone, empty: "No phone on file" },
            { key: "email", icon: Mail, value: item.email, empty: "No email on file" },
            { key: "terms", icon: CalendarClock, prefix: "Terms", value: m.paymentTerms, empty: "No payment terms" },
            { key: "hours", icon: Clock, value: m.emergencyAvailable ? "24/7 emergency service" : "Business hours only" },
            {
              key: "1099",
              icon: FileCheck,
              value: m.is1099 ? (m.w9OnFile ? "1099 eligible · W-9 on file" : "1099 eligible · W-9 missing") : "Not 1099 eligible",
            },
          ]}
        />
        {trades.length ? (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {trades.map((t) => (
              <Badge key={t} variant="neutral">
                {t}
              </Badge>
            ))}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard bare title="Compliance & access" description="Certificates, licenses and portal access.">
        <LinkRows
          onNavigate={onNavigate}
          rows={[
            {
              key: "coi",
              icon: ShieldCheck,
              title: "Insurance (COI)",
              description: c?.coi.soonest ? `Soonest expiry ${formatDate(c.coi.soonest)}` : "Certificates of insurance on file.",
              control: c ? (
                <StatusPill status={c.coi.state} map={COMPLIANCE_STATUS_MAP} />
              ) : (
                <span className="text-xs text-text-tertiary">Checking…</span>
              ),
              section: "insurance",
            },
            {
              key: "license",
              icon: BadgeCheck,
              title: "Licenses",
              description: c?.license.soonest ? `Soonest expiry ${formatDate(c.license.soonest)}` : "Trade licenses on file.",
              control: c ? (
                <StatusPill status={c.license.state} map={COMPLIANCE_STATUS_MAP} />
              ) : (
                <span className="text-xs text-text-tertiary">Checking…</span>
              ),
              section: "licenses",
            },
            {
              key: "portal",
              icon: Smartphone,
              title: "Vendor portal",
              description: "Jobs, invoices and documents.",
              control: m.vendorPortalAccess ? <Badge variant="success">Enabled</Badge> : <Badge variant="outline">Off</Badge>,
              section: "portal",
            },
          ]}
        />
      </SectionCard>
    </div>
  );
}

// --- ratings & reviews ---------------------------------------------------------

const reviewAdapter = recordItemsAdapter("review");
const stars = (n) => "★".repeat(Math.max(0, Math.min(5, Math.round(Number(n) || 0)))).padEnd(5, "☆");

// Reviews as record_items (rating in `amount`); the vendor's rating column tracks the average.
export function VendorReviewsSection(props) {
  const { item, config, onCommit } = props;
  const [rows, setRows] = useState(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve(reviewAdapter.load(item, config)).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
    // Keyed on the record id so edits in other tabs don't refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const average = (list) => {
    const rated = list.filter((r) => Number(r.amount) > 0);
    return rated.length ? Math.round((rated.reduce((s, r) => s + Number(r.amount), 0) / rated.length) * 10) / 10 : 0;
  };

  const sync = (next) => {
    setRows(next);
    const avg = average(next);
    if (avg !== Number(item.rating || 0)) onCommit({ rating: avg });
  };

  const list = rows || [];
  const rehire = list.filter((r) => r.wouldHireAgain).length;

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <MiniStat label="Average rating">
            <span className="text-lg font-semibold tabular-nums">{list.length ? `${average(list).toFixed(1)} ★` : "—"}</span>
          </MiniStat>
          <MiniStat label="Reviews">{list.length}</MiniStat>
          <MiniStat label="Would hire again">{list.length ? `${Math.round((rehire / list.length) * 100)}%` : "—"}</MiniStat>
        </div>
      </SectionCard>
      <ChildRecords
        item={item}
        config={config}
        adapter={reviewAdapter}
        fields={REVIEW_FIELDS}
        singular="Review"
        plural="Reviews"
        icon={Star}
        defaults={() => ({ amount: 5, wouldHireAgain: true })}
        emptyDescription="Rate jobs as they close to build this vendor's track record."
        onChange={sync}
        summary={(r) => ({
          title: `${stars(r.amount)}  ${r.name || "Review"}`,
          meta: [formatDate(r.startsOn), r.workOrder, r.comment].filter((x) => x && x !== "—").join(" · ") || undefined,
          badge: r.quality || undefined,
          badgeVariant: r.quality === "Poor" ? "danger" : r.quality === "Excellent" ? "success" : "neutral",
        })}
      />
    </div>
  );
}

// --- portal --------------------------------------------------------------------

export function VendorPortalSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const m = item.metadata || {};
  const status = m.portalStatus || (m.vendorPortalAccess ? "Active" : "Not invited");
  return (
    <div className="space-y-4">
      <InfoNotice>
        Vendors sign in at <span className="text-foreground">{portalAddress()}</span> with a one-time link sent to their
        login email to update work orders, submit invoices and upload COIs. Switch the vendor portal on in Settings →
        Branding &amp; Portals.
      </InfoNotice>
      <SectionCard
        title="Invite"
        action={
          <div className="flex flex-wrap gap-2">
            {m.vendorPortalAccess ? (
              <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("disablePortal")}>
                <Power className="h-4 w-4" /> Disable
              </Button>
            ) : null}
            {status !== "Active" || !m.vendorPortalAccess ? (
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("invitePortal")}>
                <MailPlus className="h-4 w-4" /> {status === "Invited" ? "Resend Invite" : "Invite to Portal"}
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <MiniStat label="Status">
            <StatusPill status={status} map={PORTAL_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Login email">{m.portalInviteEmail || item.email || "—"}</MiniStat>
          <MiniStat label="Invited">{m.portalInvitedAt ? new Date(m.portalInvitedAt).toLocaleDateString() : "—"}</MiniStat>
        </div>
      </SectionCard>
      <SectionCard title="Access">
        <FieldsForm item={item} fields={VENDOR_PORTAL_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
    </div>
  );
}
