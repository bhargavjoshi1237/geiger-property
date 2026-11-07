"use client";

import { Check, CornerDownRight, X } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { stepSummary } from "@/lib/automations/catalog";
import { explainRun } from "@/lib/orchestration/explain";
import { recordTab } from "@/lib/orchestration/records";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { STEP_LOG_STATUS_MAP } from "./shared";

// Shared run detail pieces (ORCH-02): why a run ran, and each step's inputs, outputs and the records it touched.
// Used by Run History, the "Automation Runs" section on record editors and the review queue.

const usd = (n) => `$${(Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Clickable chips for { type, id, label } links; types without a screen render as plain chips.
export function LinkChips({ links }) {
  const { openItemInTab } = useWorkspaceUrl();
  const list = (links || []).filter((l) => l?.id);
  if (!list.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {list.map((l) => {
        const tab = recordTab(l.type);
        return tab ? (
          <button
            key={`${l.type}:${l.id}`}
            type="button"
            onClick={() => openItemInTab(l.id, tab)}
            className="rounded-md border border-border bg-surface-card px-2 py-0.5 text-[11px] text-text-secondary transition-colors hover:bg-surface-hover hover:text-foreground"
          >
            {l.label || l.type}
          </button>
        ) : (
          <span key={`${l.type}:${l.id}`} className="rounded-md border border-border px-2 py-0.5 text-[11px] text-text-tertiary">
            {l.label || l.type}
          </span>
        );
      })}
    </div>
  );
}

// Key inputs of a step as short "label: value" pairs.
function inputPairs(input) {
  if (!input || typeof input !== "object") return [];
  const out = [];
  if (Array.isArray(input.recipients) && input.recipients.length) {
    out.push(["To", input.recipients.map((r) => `${r.name || r.address || "recipient"}${r.address && r.name ? ` <${r.address}>` : ""}`).join(", ")]);
  }
  if (input.subject) out.push(["Subject", input.subject]);
  if (input.templateId && !input.subject) out.push(["Template", "From a template"]);
  if (input.category === "legal") out.push(["Kind", "Legal notice"]);
  if (input.amount !== undefined) out.push(["Amount", usd(input.amount)]);
  if (input.memo) out.push(["Memo", input.memo]);
  if (input.name) out.push(["Title", input.name]);
  if (input.status) out.push(["Status", `${input.previous ? `${input.previous} → ` : ""}${input.status}`]);
  if (input.title) out.push(["Title", input.title]);
  return out;
}

export function RunWhy({ run }) {
  const ex = explainRun(run);
  return (
    <div className="space-y-3">
      <p className="text-sm text-foreground">{ex.headline}</p>
      {ex.conditions.length ? (
        <ul className="space-y-1">
          {ex.conditions.map((c, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-text-secondary" style={{ paddingLeft: c.depth * 14 }}>
              {c.group ? (
                <CornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-tertiary" />
              ) : c.passed ? (
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <X className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600 dark:text-red-400" />
              )}
              <span>{c.text}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {ex.values.length ? (
        <div className="flex flex-wrap gap-1.5">
          {ex.values.map((v) => (
            <Badge key={v.field} variant="neutral" className="font-normal">
              {v.label}: {String(v.value)}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function RunSteps({ run }) {
  const steps = Array.isArray(run?.steps) ? run.steps : [];
  const log = Array.isArray(run?.log) ? run.log : [];
  if (!steps.length) return <p className="text-sm text-text-secondary">No step-level detail was recorded for this run.</p>;
  return (
    <ol className="space-y-2">
      {steps.map((s, i) => {
        const entry = [...log].reverse().find((l) => l.step === i);
        const pairs = inputPairs(entry?.input);
        return (
          <li key={s.id || i} className="flex items-start gap-3 rounded-lg border border-border bg-surface-subtle p-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-border text-[10px] text-text-secondary">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{stepSummary(s)}</p>
              {entry?.message ? <p className="mt-0.5 text-xs text-text-secondary">{entry.message}</p> : null}
              {pairs.length ? (
                <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                  {pairs.map(([k, v]) => (
                    <div key={k} className="contents">
                      <dt className="text-text-tertiary">{k}</dt>
                      <dd className="truncate text-text-secondary">{v}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              <LinkChips links={entry?.links} />
            </div>
            {entry ? <StatusPill status={entry.status} map={STEP_LOG_STATUS_MAP} /> : <Badge variant="outline">Not run</Badge>}
          </li>
        );
      })}
    </ol>
  );
}
