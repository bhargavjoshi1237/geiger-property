"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Check, History } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { listShowingsForProspect } from "@/lib/supabase/showings";
import { listApplicationsForProspect } from "@/lib/supabase/applications";
import { listRecordItems } from "@/lib/supabase/record_items";
import { logSystemActivity } from "@/lib/supabase/activity_log";
import { marketingUnitOptions } from "@/lib/supabase/marketing_options";
import { cn } from "@/lib/utils";
import { KeyValues, useLoad } from "./common";
import { nextStageHistory } from "../flows";
import {
  PROSPECT_STAGES,
  PROSPECT_STATUS_MAP,
  currency,
  daysSince,
  formatDate,
  formatDateTime,
  isPast,
  toOptions,
} from "../shared";

// Prospect editor sections: pipeline stage + history, overview, unit hold.

const stageLabel = (s) => PROSPECT_STATUS_MAP[s]?.label || s || "—";

// Clickable stage stepper in funnel order (Lost sits apart).
export function StageStepper({ status, onPick, disabled }) {
  const flow = PROSPECT_STAGES.filter((s) => s !== "Lost");
  const at = flow.indexOf(status === "Leased" ? "Converted" : status);
  return (
    <ol className="flex flex-wrap items-center gap-1.5">
      {flow.map((s, i) => {
        const done = at >= 0 && i < at;
        const current = i === at;
        return (
          <li key={s} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled || !onPick || current}
              onClick={() => onPick?.(s)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:cursor-default",
                current && "border-border-strong bg-primary text-primary-foreground",
                done && "border-border-strong bg-surface-active text-foreground",
                !current && !done && "border-border bg-surface-card text-text-secondary hover:bg-surface-hover hover:text-foreground",
              )}
            >
              {done ? <Check className="h-3 w-3" /> : null}
              {stageLabel(s)}
            </button>
            {i < flow.length - 1 ? <ArrowRight className="h-3 w-3 text-text-tertiary" /> : null}
          </li>
        );
      })}
      {status === "Lost" ? <StatusPill status="Lost" map={PROSPECT_STATUS_MAP} className="ml-2" /> : null}
    </ol>
  );
}

// Stage changes from the editor: column + history entry + activity log.
export function PipelineSection({ item, config, onCommit, onCommitMeta, runAction }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const history = Array.isArray(item.metadata?.stageHistory) ? [...item.metadata.stageHistory].reverse() : [];

  const move = async (to) => {
    if (to === "Lost") return runAction("markLost");
    setBusy(true);
    const from = item.status;
    const ok = await onCommit({ status: to });
    if (ok) {
      await onCommitMeta({ stageHistory: nextStageHistory(item, to, note.trim()) });
      logSystemActivity(config.key, item.id, "stage", `Stage: ${stageLabel(from)} → ${stageLabel(to)}${note.trim() ? ` (${note.trim()})` : ""}`);
      toast.success(`Moved to ${stageLabel(to)}.`);
      setNote("");
    }
    setBusy(false);
  };

  return (
    <div className="space-y-5">
      <SectionCard title="Stage" description="Click a stage to move this prospect. Every move is kept in the history below.">
        <div className="space-y-4">
          <StageStepper status={item.status} onPick={move} disabled={busy} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note for the next stage change (optional)"
              className="bg-surface-card"
            />
            <Button
              variant="outline"
              className="border-border bg-surface-card text-red-600 hover:bg-red-500/10 dark:text-red-300"
              disabled={busy || item.status === "Lost"}
              onClick={() => runAction("markLost")}
            >
              Mark lost
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Stage history" description={`In the current stage for ${daysSince(history[0]?.at || item.createdAt) ?? 0} days.`}>
        {history.length === 0 ? (
          <EmptyState icon={History} title="No stage changes yet" description="Stage moves show up here with who, when and why." className="py-8" />
        ) : (
          <ol className="space-y-3">
            {history.map((h) => (
              <li key={h.id || h.at} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-text-secondary">
                  <History className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-foreground">
                    {stageLabel(h.from)} <span className="text-text-tertiary">→</span> {stageLabel(h.to)}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {[formatDateTime(h.at), h.note].filter(Boolean).join(" · ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </SectionCard>
    </div>
  );
}

export function ProspectOverviewSection({ item, config, onCommit, onCommitMeta, runAction }) {
  const related = useLoad(async () => {
    const [s, a, f, q] = await Promise.all([
      listShowingsForProspect(item.id),
      listApplicationsForProspect(item.id),
      listRecordItems(config.key, item.id, "follow_up"),
      listRecordItems(config.key, item.id, "quote"),
    ]);
    const open = (f ?? []).filter((x) => x.status !== "Done").sort((x, y) => String(x.startsOn).localeCompare(String(y.startsOn)));
    const quotes = (q ?? []).filter((x) => !["Declined", "Expired"].includes(x.status) && !(x.endsOn && isPast(x.endsOn)));
    return { showings: s ?? [], apps: a ?? [], next: open[0] || null, quote: quotes[quotes.length - 1] || null };
  }, [item.id]);
  const m = item.metadata || {};

  return (
    <div className="space-y-5">
      <SectionCard title="Pipeline">
        <StageStepper
          status={item.status}
          onPick={async (to) => {
            if (to === "Lost") return runAction("markLost");
            if (!(await onCommit({ status: to }))) return;
            await onCommitMeta({ stageHistory: nextStageHistory(item, to, "") });
            logSystemActivity(config.key, item.id, "stage", `Stage: ${stageLabel(item.status)} → ${stageLabel(to)}`);
          }}
        />
      </SectionCard>
      {related === undefined ? (
        <ListLoading label="Loading prospect" className="py-10" />
      ) : (
        <KeyValues
          items={[
            { label: "Contact", value: [item.email, item.phone].filter(Boolean).join(" · ") || "—" },
            { label: "Source", value: item.source || "—" },
            { label: "Listing", value: item.listingName || "—" },
            { label: "Unit of interest", value: item.unit || "—" },
            { label: "Budget", value: item.budget ? `${m.budgetMin ? `${currency(m.budgetMin)} – ` : ""}${currency(item.budget)}/mo` : "—" },
            { label: "Move-in", value: formatDate(item.moveInDate) },
            { label: "Looking for", value: [m.bedrooms ? `${m.bedrooms} bd` : null, m.bathrooms ? `${m.bathrooms} ba` : null, m.pets ? "Has pets" : null].filter(Boolean).join(" · ") || "—" },
            {
              label: "Next follow-up",
              value: related?.next
                ? `${related.next.name} · ${formatDate(related.next.startsOn)}${related.next.startsOn && isPast(related.next.startsOn) ? " (overdue)" : ""}`
                : "None scheduled",
              className: related?.next?.startsOn && isPast(related.next.startsOn) ? "text-amber-700 dark:text-amber-400" : undefined,
            },
            { label: "Latest quote", value: related?.quote ? `${currency(related.quote.amount)}/mo · ${related.quote.unit || related.quote.name}` : "—" },
            { label: "Unit hold", value: m.holdStatus === "Active" ? `${m.holdUnit || "Unit"} until ${formatDate(m.holdUntil)}` : "No hold" },
            { label: "Showings", value: String(related?.showings.length ?? 0) },
            { label: "Applications", value: String(related?.apps.length ?? 0) },
          ]}
        />
      )}
      {item.status === "Lost" ? (
        <KeyValues
          title="Lost"
          items={[
            { label: "Reason", value: m.lostReason || "—" },
            { label: "Lost on", value: formatDate(m.lostAt) },
            { label: "Competitor", value: m.lostCompetitor || "—" },
            { label: "Re-engage on", value: formatDate(m.reengageOn) },
          ]}
        />
      ) : null}
    </div>
  );
}

const HOLD_STATUS = toOptions(["None", "Active", "Released", "Expired", "Converted"]);

// Reserved unit hold stored in metadata (holdUnitId / holdUnit / holdUntil…).
export function UnitHoldSection({ item, onPatch, onCommit, onCommitMeta }) {
  const units = useLoad(() => marketingUnitOptions(), ["units"]);
  const m = item.metadata || {};
  const expired = m.holdStatus === "Active" && m.holdUntil && isPast(m.holdUntil);
  const fields = [
    {
      key: "holdUnitId",
      label: "Held unit",
      type: "select",
      meta: true,
      options: (units || []).map((u) => ({ value: u.value, label: u.label })),
      placeholder: units ? "Select a unit…" : "Loading…",
    },
    { key: "holdUntil", label: "Hold until", type: "date", meta: true },
    { key: "holdDeposit", label: "Holding deposit", type: "currency", meta: true },
    { key: "holdDepositPaid", label: "Deposit received", type: "switch", meta: true },
    { key: "holdStatus", label: "Hold status", type: "select", meta: true, options: HOLD_STATUS },
    { key: "holdNotes", label: "Hold terms", type: "textarea", meta: true, placeholder: "Refundable if…, applies to first month…" },
  ];

  // Picking a unit also stores its display name.
  const commitMeta = (patch) => {
    if ("holdUnitId" in patch) {
      const u = (units || []).find((x) => x.value === patch.holdUnitId);
      return onCommitMeta({ ...patch, holdUnit: u?.patch.unit || "", holdStatus: m.holdStatus && m.holdStatus !== "None" ? m.holdStatus : "Active" });
    }
    return onCommitMeta(patch);
  };

  return (
    <div className="space-y-5">
      {expired ? (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          This hold expired on {formatDate(m.holdUntil)}. Extend it or release the unit.
        </div>
      ) : null}
      <FieldsForm item={item} fields={fields} onPatch={onPatch} onCommit={onCommit} onCommitMeta={commitMeta} />
    </div>
  );
}
