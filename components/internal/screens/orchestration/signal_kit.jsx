"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpRight,
  Check,
  CircleDollarSign,
  FileSignature,
  Loader2,
  Receipt,
  RotateCcw,
  ShieldCheck,
  Workflow,
  Wrench,
} from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { SuggestedActionButton } from "@/components/internal/screens/orchestration/launcher";
import { useRbac } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { money } from "@/lib/reports/format";
import { recordTab, recordTypeLabel } from "@/lib/orchestration/records";
import { AREAS, CATEGORIES, SIGNAL_STATUS_MAP, URGENCY, areasForRole } from "@/lib/signals/constants";
import { changesSince } from "@/lib/signals/rank";
import { acknowledgeSignal, listSignals, reopenSignal } from "@/lib/supabase/signals";
import { getSetting } from "@/lib/supabase/settings";
import { NOTIFICATIONS_SETTING_KEY } from "@/lib/email/catalog";

// Shared pieces for signal surfaces (Overview Today panel, Briefing screen): the viewer's areas, the signal
// list with acknowledge, area icons, change chips and the signal detail sheet.

const DAY = 86400000;

export const AREA_ICONS = {
  collections: CircleDollarSign,
  leasing: FileSignature,
  maintenance: Wrench,
  accounting: Receipt,
  compliance: ShieldCheck,
  automation: Workflow,
};

export const formatImpact = (s) => (s?.impactAmount ? money(s.impactAmount) : "—");

// A clock captured once per mount, so "new today" and "3h ago" stay stable across re-renders.
export const useNow = () => useState(() => Date.now())[0];

export function relativeTime(v, now) {
  if (!v) return "—";
  const mins = Math.round((now - new Date(v).getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? "just now" : `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export const isNew = (s, now) => Boolean(s.firstSeenAt) && now - new Date(s.firstSeenAt).getTime() < DAY;
export const isWorse = (s, now) => Boolean(s.worsenedAt) && now - new Date(s.worsenedAt).getTime() < DAY;

// Areas the signed-in role sees (null = every area). Financial areas also need accounting / rent view.
export function useSignalAreas() {
  const { loading, configured, isOwner, role, member, can } = useRbac();
  const [overrides, setOverrides] = useState({});
  useEffect(() => {
    let alive = true;
    getSetting(NOTIFICATIONS_SETTING_KEY, {}).then((v) => alive && setOverrides(v?.briefing?.roleAreas || {}));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => {
    if (loading || !configured || isOwner) return null;
    const base = areasForRole(role || member?.role || "manager", overrides);
    return base.filter((a) => {
      if (a === "accounting") return can("view.accounting");
      if (a === "collections") return can("view.rent_collection") || can("view.accounting");
      return true;
    });
  }, [loading, configured, isOwner, role, member, can, overrides]);
}

export function useSignals() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    const rows = await listSignals();
    setSignals(rows ?? []);
    setLoading(false);
  }, []);
  useEffect(() => {
    let alive = true;
    listSignals().then((rows) => {
      if (!alive) return;
      setSignals(rows ?? []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const patch = (id, next) => setSignals((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
  const acknowledge = async (s) => {
    patch(s.id, { status: "acknowledged" });
    const saved = await acknowledgeSignal(s.id);
    if (!saved) {
      patch(s.id, { status: s.status });
      toast.error("Couldn't acknowledge the signal.");
      return false;
    }
    patch(s.id, saved);
    toast.success("Signal acknowledged.");
    return true;
  };
  const reopen = async (s) => {
    patch(s.id, { status: "open" });
    const saved = await reopenSignal(s.id);
    if (!saved) {
      patch(s.id, { status: s.status });
      toast.error("Couldn't reopen the signal.");
      return false;
    }
    patch(s.id, saved);
    return true;
  };
  return { signals, loading, reload, acknowledge, reopen };
}

// "3 new · 1 worse · 2 resolved" since a moment (default: the last 24 hours).
export function ChangeChips({ signals, areas, since, className = "" }) {
  const now = useNow();
  const c = changesSince(signals, since || new Date(now - DAY).toISOString(), { areas });
  const chips = [
    { key: "new", label: "new", count: c.new.length, cls: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300" },
    { key: "worse", label: "worse", count: c.worse.length, cls: "border-red-500/20 bg-red-500/10 text-red-700 dark:text-red-300" },
    { key: "resolved", label: "resolved", count: c.resolved.length, cls: "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" },
  ];
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {chips.map((chip) => (
        <span key={chip.key} className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${chip.count ? chip.cls : "border-border bg-surface-card text-text-tertiary"}`}>
          {chip.count} {chip.label}
        </span>
      ))}
    </div>
  );
}

export function SignalBadges({ signal, now }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusPill status={signal.urgency} map={URGENCY} />
      <Badge variant={CATEGORIES[signal.category]?.variant || "neutral"}>{CATEGORIES[signal.category]?.label || signal.category}</Badge>
      {isNew(signal, now) ? <Badge variant="info">New</Badge> : isWorse(signal, now) ? <Badge variant="danger">Worse</Badge> : null}
    </div>
  );
}

// Signal detail: why, impact, completeness, records, suggested actions, acknowledge.
export function SignalSheet({ signal, onClose, onAcknowledge, onReopen, onActioned }) {
  const { openItemInTab } = useWorkspaceUrl();
  const now = useNow();
  const [busy, setBusy] = useState(false);
  const Icon = AREA_ICONS[signal?.area] || Workflow;
  const run = async (fn) => {
    setBusy(true);
    await fn(signal);
    setBusy(false);
  };

  return (
    <Sheet open={Boolean(signal)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="pr-6">{signal?.title || "Signal"}</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5">
            <Icon className="h-3.5 w-3.5" /> {AREAS[signal?.area]?.label || "Signal"} · first seen {relativeTime(signal?.firstSeenAt, now)}
          </SheetDescription>
        </SheetHeader>
        {signal ? (
          <div className="space-y-6 px-4 pb-8 pt-2">
            <div className="flex flex-wrap items-center gap-2">
              <SignalBadges signal={signal} now={now} />
              <StatusPill status={signal.status} map={SIGNAL_STATUS_MAP} />
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Why</p>
              <p className="text-sm text-foreground">{signal.why}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-text-tertiary">Impact</p>
                <p className="tabular-nums text-foreground">{formatImpact(signal)}</p>
                {signal.previousImpactAmount !== null && signal.impactAmount > signal.previousImpactAmount ? (
                  <p className="text-[11px] text-red-600 dark:text-red-400">up from {money(signal.previousImpactAmount)}</p>
                ) : null}
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Confidence</p>
                <p className="text-foreground">{signal.confidence === "certain" ? "Certain (a rule)" : signal.confidence}</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Data completeness</p>
                <p className="tabular-nums text-foreground">{Math.round((Number(signal.completeness) || 0) * 100)}%</p>
              </div>
              <div>
                <p className="text-xs text-text-tertiary">Last checked</p>
                <p className="text-foreground">{relativeTime(signal.lastSeenAt, now)}</p>
              </div>
            </div>
            {signal.completenessNote ? (
              <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">{signal.completenessNote}</p>
            ) : null}

            {signal.suggestedActions.length ? (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">Do something about it</p>
                <div className="flex flex-wrap gap-2">
                  {signal.suggestedActions.map((a, i) => (
                    <SuggestedActionButton
                      key={`${a.type}:${a.label}:${i}`}
                      action={a}
                      signal={signal}
                      variant={i === 0 ? "default" : "outline"}
                      className={i === 0 ? "bg-primary text-primary-foreground hover:bg-primary/90" : ""}
                      onDone={() => onActioned?.(signal)}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-tertiary">
                Records {signal.recordRefs.length ? `(${signal.recordRefs.length})` : ""}
              </p>
              {signal.recordRefs.length ? (
                <ul className="divide-y divide-border rounded-lg border border-border bg-surface-subtle">
                  {signal.recordRefs.map((r) => {
                    const tab = recordTab(r.type);
                    return (
                      <li key={`${r.type}:${r.id}`}>
                        <button
                          type="button"
                          disabled={!tab}
                          onClick={() => tab && openItemInTab(r.id, tab)}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-hover disabled:cursor-default"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-foreground">{r.label || recordTypeLabel(r.type)}</span>
                            <span className="block text-[11px] text-text-tertiary">{recordTypeLabel(r.type)}</span>
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-xs tabular-nums text-text-secondary">
                            {r.amount ? money(r.amount) : null}
                            {tab ? <ArrowUpRight className="h-3.5 w-3.5" /> : null}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-text-secondary">This signal is about the portfolio as a whole.</p>
              )}
            </div>

            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              {signal.status === "open" ? (
                <Button variant="outline" className="border-border bg-surface-card text-muted-foreground hover:bg-surface-hover hover:text-foreground" disabled={busy} onClick={() => run(onAcknowledge)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Acknowledge
                </Button>
              ) : signal.status === "acknowledged" ? (
                <Button variant="ghost" className="text-muted-foreground hover:bg-surface-active" disabled={busy} onClick={() => run(onReopen)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Mark unread
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
