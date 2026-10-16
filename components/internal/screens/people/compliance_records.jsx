"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

import { SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { ChildRecords, recordItemsAdapter } from "@/components/internal/screens/entity/sections/child_records";
import { COMPLIANCE_STATUS_MAP, complianceOf, expiryBadge } from "@/lib/compliance";
import { formatDate } from "./shared";

// Expiring compliance records (renters insurance, COIs, licenses) as a
// record_items repeater with per-row expiry badges and an overall status card.
// Options: { kind, fields, singular, plural, icon, title(row), meta(row), aside?(row),
//   required(item) → bool, heading, note?, onSync?(rows, ctx) }.
export function makeComplianceSection({
  kind,
  fields,
  singular,
  plural,
  icon = ShieldCheck,
  title,
  meta,
  aside,
  required = () => true,
  heading,
  note,
  defaults,
  onSync,
}) {
  const adapter = recordItemsAdapter(kind);

  function ComplianceSection({ item, config, onCommit, onCommitMeta }) {
    const [rows, setRows] = useState(null);
    const isRequired = required(item);
    const summary = rows ? complianceOf(rows, { required: isRequired }) : null;

    // Own fetch for the status card; the repeater below reports later edits via onChange.
    useEffect(() => {
      let alive = true;
      Promise.resolve(adapter.load(item, config))
        .then((r) => alive && setRows(r ?? []))
        .catch(() => alive && setRows([]));
      return () => {
        alive = false;
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [item.id]);

    const handleChange = (next) => {
      setRows(next);
      onSync?.(next, { item, onCommit, onCommitMeta });
    };

    return (
      <div className="space-y-4">
        <SectionCard>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{heading}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {summary ? (
                  <StatusPill status={summary.state} map={COMPLIANCE_STATUS_MAP} />
                ) : (
                  <span className="text-sm text-text-tertiary">Checking…</span>
                )}
                {summary?.soonest ? (
                  <span className="text-sm text-text-secondary">Next expiry {formatDate(summary.soonest)}</span>
                ) : null}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">In force</p>
              <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">
                {summary ? summary.inForce.length : "—"}
              </p>
            </div>
          </div>
          {note ? <p className="mt-3 text-sm text-text-secondary">{note(item, isRequired)}</p> : null}
        </SectionCard>

        <ChildRecords
          item={item}
          config={config}
          adapter={adapter}
          fields={fields}
          singular={singular}
          plural={plural}
          icon={icon}
          defaults={defaults}
          onChange={handleChange}
          summary={(row) => {
            const b = expiryBadge(row);
            return {
              title: title(row),
              meta: meta(row),
              badge: b.label,
              badgeVariant: b.variant,
              aside: aside ? aside(row) : undefined,
            };
          }}
        />
      </div>
    );
  }
  return ComplianceSection;
}

export default makeComplianceSection;
