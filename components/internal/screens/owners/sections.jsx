"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Building2, CheckCircle2, Import, MailPlus, Power } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords } from "@/components/internal/screens/entity/sections/child_records";
import { makeRelatedSection } from "@/components/internal/screens/entity/sections/related_section";
import { InfoNotice, MiniStat } from "@/components/internal/screens/people/notice";
import { PORTAL_STATUS_MAP, formatDateTime } from "@/components/internal/screens/people/shared";
import { portalAddress } from "@/lib/portal/staff_api";
import { propertyIdOptions } from "@/components/internal/screens/people/options";
import { propertyOwnersLayer, listPropertiesOfOwner } from "@/lib/supabase/property_owners";
import { listProperties } from "@/lib/supabase/properties";
import { daysUntil } from "@/lib/compliance";
import {
  OWNER_STATUS_MAP,
  OWNERSHIP_SUMMARY,
  currency,
  formatDate,
  holdsPayouts,
  legacySplitsOf,
  needsW9,
  percent,
  reserveLabel,
} from "./shared";

export const ownerPortalStatus = (o) => o?.metadata?.portalStatus || (o?.portalAccess ? "Active" : "Not invited");

// --- ownerships (property_owners child rows) ---------------------------------

export const OWNERSHIP_FIELDS = [
  { key: "propertyId", label: "Property", type: "relation", load: propertyIdOptions, required: true, full: true },
  { key: "ownershipPct", label: "Ownership share", type: "percent", min: 0, max: 100, required: true },
  { key: "isPrimary", label: "Primary owner", type: "switch" },
  { key: "startsOn", label: "Owned since", type: "date" },
  { key: "endsOn", label: "Owned until", type: "date" },
];

const ownershipAdapter = {
  load: (item) => listPropertiesOfOwner(item.id),
  create: (item, values) =>
    propertyOwnersLayer.create({ id: crypto.randomUUID(), ...values, ownerId: item.id, ownerName: item.name }),
  update: (row, values) => propertyOwnersLayer.update(row.id, values),
  remove: (row) => propertyOwnersLayer.softDelete(row.id),
};

// Properties owned and this owner's share; keeps owners.properties_count in sync.
export function OwnershipsSection({ item, config, onCommit, onCommitMeta }) {
  const legacy = legacySplitsOf(item);
  const [rows, setRows] = useState(null);
  const [importing, setImporting] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    listPropertiesOfOwner(item.id).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [item.id, version]);

  const sync = (next) => {
    setRows(next);
    if (next.length !== Number(item.propertiesCount)) onCommit({ propertiesCount: next.length });
  };

  // One-time move of legacy metadata splits into property_owners (matched by name).
  const importLegacy = async () => {
    setImporting(true);
    const props = (await listProperties()) ?? [];
    const byName = new Map(props.map((p) => [String(p.name).trim().toLowerCase(), p]));
    let moved = 0;
    for (const s of legacy) {
      const p = byName.get(String(s.label || "").trim().toLowerCase());
      const created = await propertyOwnersLayer.create({
        id: crypto.randomUUID(),
        ownerId: item.id,
        ownerName: item.name,
        propertyId: p?.id || "",
        propertyName: p?.name || s.label || "",
        ownershipPct: Number(s.pct) || 0,
      });
      if (created) moved += 1;
    }
    setImporting(false);
    if (moved === legacy.length) await onCommitMeta({ properties: [], legacySplitsImportedAt: new Date().toISOString() });
    if (moved) toast.success(`Moved ${moved} ownership record${moved === 1 ? "" : "s"}.`);
    else toast.error("Couldn't move the earlier splits.");
    setVersion((v) => v + 1);
  };

  const total = (rows || []).reduce((s, r) => s + (Number(r.ownershipPct) || 0), 0);
  const over = (rows || []).some((r) => Number(r.ownershipPct) > 100 || Number(r.ownershipPct) < 0);

  return (
    <div className="space-y-4">
      {legacy.length ? (
        <SectionCard
          title="Earlier ownership splits"
          description={`${legacy.length} split${legacy.length === 1 ? "" : "s"} recorded before ownership records existed: ${legacy
            .map((s) => `${s.label} (${percent(s.pct)})`)
            .join(", ")}.`}
          action={
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" disabled={importing} onClick={importLegacy}>
              <Import className="h-4 w-4" /> {importing ? "Moving…" : "Move to records"}
            </Button>
          }
        >
          <p className="text-sm text-text-secondary">Properties are matched by name; unmatched splits keep their label.</p>
        </SectionCard>
      ) : null}

      <SectionCard>
        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          <MiniStat label="Properties">{rows ? rows.length : "—"}</MiniStat>
          <MiniStat label="Average share">{rows?.length ? percent(Math.round((total / rows.length) * 10) / 10) : "—"}</MiniStat>
          <MiniStat label="Primary on">{rows ? rows.filter((r) => r.isPrimary).length : "—"}</MiniStat>
        </div>
        <p className={over ? "mt-3 text-sm text-red-600 dark:text-red-400" : "mt-3 text-sm text-text-secondary"}>
          {over ? "Each ownership share must be between 0% and 100%." : "Co-owners each record their own share of a property."}
        </p>
      </SectionCard>

      <ChildRecords
        key={version}
        item={item}
        config={config}
        adapter={ownershipAdapter}
        fields={OWNERSHIP_FIELDS}
        singular="Ownership"
        plural="Ownerships"
        icon={Building2}
        defaults={() => ({ ownershipPct: 100, isPrimary: true })}
        emptyDescription="Link the properties this owner holds and their percentage share."
        summary={OWNERSHIP_SUMMARY}
        onChange={sync}
      />
    </div>
  );
}

// Properties this owner holds, with location and share (opens in Properties).
export const OwnerPropertiesSection = makeRelatedSection({
  load: async (item) => {
    const [links, props] = await Promise.all([listPropertiesOfOwner(item.id), listProperties()]);
    const byId = new Map((props ?? []).map((p) => [p.id, p]));
    return (links ?? [])
      .filter((l) => l.propertyId && byId.has(l.propertyId))
      .map((l) => ({ ...byId.get(l.propertyId), id: l.propertyId, share: l.ownershipPct, isPrimaryOwner: l.isPrimary, since: l.startsOn }));
  },
  tab: "Properties",
  plural: "Properties",
  icon: Building2,
  emptyDescription: "Add ownerships to see this owner's properties here.",
  columns: [
    {
      key: "name",
      header: "Property",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="font-medium text-foreground">{r.name || "Property"}</span>
          <span className="text-xs text-text-secondary">{[r.address, r.city, r.state].filter(Boolean).join(", ") || "—"}</span>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (r) => <span className="text-sm text-muted-foreground">{r.type || "—"}</span> },
    { key: "units", header: "Units", render: (r) => <span className="text-sm tabular-nums text-muted-foreground">{r.units || 0}</span> },
    { key: "status", header: "Status", render: (r) => <StatusPill status={r.status} /> },
    {
      key: "share",
      header: "Share",
      align: "right",
      className: "text-right tabular-nums text-foreground",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          {r.isPrimaryOwner ? <Badge variant="info">Primary</Badge> : null}
          {percent(r.share)}
        </span>
      ),
    },
  ],
});

// --- overview -----------------------------------------------------------------

export function OwnerOverviewSection({ item, onNavigate }) {
  const [links, setLinks] = useState(null);
  useEffect(() => {
    let alive = true;
    listPropertiesOfOwner(item.id).then((r) => alive && setLinks(r ?? []));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const m = item.metadata || {};
  const agreementDays = daysUntil(m.agreementEnd);
  const attention = [
    holdsPayouts(item) ? { text: `Payouts on hold${m.holdReason ? ` — ${m.holdReason}` : ""}`, to: "payouts" } : null,
    needsW9(item) ? { text: "W-9 not on file", to: "tax" } : null,
    agreementDays !== null && agreementDays >= 0 && agreementDays <= 60
      ? { text: `Management agreement ends ${formatDate(m.agreementEnd)}`, to: "agreement" }
      : null,
    agreementDays !== null && agreementDays < 0 && !m.agreementAutoRenew ? { text: "Management agreement has ended", to: "agreement" } : null,
    links && links.length === 0 ? { text: "No properties linked", to: "ownerships" } : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-3">
          <MiniStat label="Status">
            <StatusPill status={item.status} map={OWNER_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Entity type">{m.entityType || "Individual"}</MiniStat>
          <MiniStat label="Properties">{links ? links.length : "—"}</MiniStat>
          <MiniStat label="Management fee">{percent(item.managementFeePct)}</MiniStat>
          <MiniStat label="Payout">
            {item.payoutMethod || "—"}
            {holdsPayouts(item) ? <Badge variant="warning" className="ml-2">On hold</Badge> : null}
          </MiniStat>
          <MiniStat label="Reserve">{reserveLabel(item)}</MiniStat>
          <MiniStat label="Email">{item.email || "—"}</MiniStat>
          <MiniStat label="Phone">{item.phone || "—"}</MiniStat>
          <MiniStat label="W-9">{m.w9OnFile ? `On file${m.w9ReceivedOn ? ` · ${formatDate(m.w9ReceivedOn)}` : ""}` : "Missing"}</MiniStat>
          <MiniStat label="Agreement">
            {m.agreementStart || m.agreementEnd ? `${formatDate(m.agreementStart)} – ${formatDate(m.agreementEnd)}` : "—"}
          </MiniStat>
          <MiniStat label="Portal">
            <StatusPill status={ownerPortalStatus(item)} map={PORTAL_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Minimum fee">{Number(m.managementFeeMinimum) ? currency(m.managementFeeMinimum) : "—"}</MiniStat>
        </div>
      </SectionCard>
      <SectionCard title="Needs attention">
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
      </SectionCard>
    </div>
  );
}

// --- portal -------------------------------------------------------------------

const OWNER_PORTAL_FIELDS = [
  { key: "portalInviteEmail", label: "Login email", type: "email", meta: true, hint: "Defaults to the owner's email." },
  { key: "portalShowStatements", label: "View statements", type: "switch", meta: true },
  { key: "portalShowWorkOrders", label: "View work orders", type: "switch", meta: true },
  { key: "portalShowDocuments", label: "View documents", type: "switch", meta: true },
  { key: "portalApproveWork", label: "Approve work and bills", type: "switch", meta: true },
];

export function OwnerPortalSection({ item, onPatch, onCommit, onCommitMeta, runAction }) {
  const status = ownerPortalStatus(item);
  return (
    <div className="space-y-4">
      <InfoNotice>
        Owners sign in at <span className="text-foreground">{portalAddress()}</span> with a one-time link sent to their
        login email. The owner portal must be switched on in Settings → Branding &amp; Portals.
      </InfoNotice>
      <SectionCard
        title="Access"
        action={
          item.portalAccess ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => runAction("togglePortal")}>
                <Power className="h-4 w-4" /> Disable
              </Button>
              {status !== "Active" ? (
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("resendPortalInvite")}>
                  <MailPlus className="h-4 w-4" /> Resend invite
                </Button>
              ) : null}
            </div>
          ) : (
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => runAction("togglePortal")}>
              <MailPlus className="h-4 w-4" /> Give portal access
            </Button>
          )
        }
      >
        <div className="grid gap-x-6 gap-y-5 sm:grid-cols-2">
          <MiniStat label="Status">
            <StatusPill status={status} map={PORTAL_STATUS_MAP} />
          </MiniStat>
          <MiniStat label="Invited">{formatDateTime(item.metadata?.portalInvitedAt)}</MiniStat>
        </div>
      </SectionCard>
      <SectionCard title="Permissions">
        <FieldsForm item={item} fields={OWNER_PORTAL_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>
    </div>
  );
}
