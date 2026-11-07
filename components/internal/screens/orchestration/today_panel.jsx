"use client";

import { useMemo, useState } from "react";
import { ArrowRight, ChevronRight, Sunrise } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Button } from "@geiger/ui/button";
import { Card, CardContent } from "@geiger/ui/card";
import { EmptyState, StatusPill } from "@/components/internal/shared/screen_kit";
import { SuggestedActionButton } from "@/components/internal/screens/orchestration/launcher";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { AREAS, URGENCY } from "@/lib/signals/constants";
import { rankSignals } from "@/lib/signals/rank";
import { AREA_ICONS, ChangeChips, SignalSheet, formatImpact, isNew, isWorse, useNow, useSignalAreas, useSignals } from "./signal_kit";

// Overview "Today" panel (ORCH-06): the top signals for my role, what changed in the last day, and a
// one-click action on each. Replaces the old Needs Attention card; its six rules are now detectors.

const LIMIT = 6;

export function TodayPanel() {
  const { setTab } = useWorkspaceUrl();
  const areas = useSignalAreas();
  const { signals, loading, reload, acknowledge, reopen } = useSignals();
  const now = useNow();
  const [openId, setOpenId] = useState(null);
  const top = useMemo(() => rankSignals(signals, { areas, limit: LIMIT }), [signals, areas]);
  const total = useMemo(() => rankSignals(signals, { areas }).length, [signals, areas]);
  const selected = openId ? signals.find((s) => s.id === openId) || null : null;

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-border bg-surface-subtle py-0 text-foreground">
      <CardContent className="p-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-foreground">Today</h3>
            <p className="text-sm text-muted-foreground">What needs you across rent, leasing, maintenance and payables, ranked by money at stake.</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ChangeChips signals={signals} areas={areas} />
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:bg-surface-active hover:text-foreground" onClick={() => setTab("Briefing")}>
              Briefing <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-10">
            <LogoLoading size={40} aria-label="Loading signals" />
          </div>
        ) : !top.length ? (
          <EmptyState
            icon={Sunrise}
            title="Nothing needs you right now"
            description={signals.length ? "Every signal for your areas is handled." : "Signals appear after the daily signals job runs (Automations → Scheduled Jobs, or Run Signals Now on the Briefing)."}
          />
        ) : (
          <ul className="mt-3 divide-y divide-border">
            {top.map((s) => {
              const Icon = AREA_ICONS[s.area] || Sunrise;
              const action = s.suggestedActions.find((a) => a.type !== "case");
              return (
                <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
                  <button type="button" onClick={() => setOpenId(s.id)} className="group flex min-w-0 flex-1 items-center gap-3 text-left">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-foreground">{s.title}</span>
                        {isNew(s, now) ? (
                          <span className="shrink-0 rounded-md border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">New</span>
                        ) : isWorse(s, now) ? (
                          <span className="shrink-0 rounded-md border border-red-500/20 bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-700 dark:text-red-300">Worse</span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-text-secondary">
                        {AREAS[s.area]?.label} · {s.why}
                      </p>
                    </div>
                    <span className="hidden shrink-0 text-sm font-semibold tabular-nums text-foreground sm:block">{formatImpact(s)}</span>
                    <StatusPill status={s.urgency} map={URGENCY} className="hidden shrink-0 md:inline-flex" />
                    <ChevronRight className="h-3 w-3 shrink-0 text-text-secondary transition-colors group-hover:text-foreground" />
                  </button>
                  {action ? (
                    <div className="shrink-0 pl-12 sm:pl-0">
                      <SuggestedActionButton action={action} signal={s} onDone={reload} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {total > top.length ? (
          <button type="button" onClick={() => setTab("Briefing")} className="mt-1 text-xs text-text-secondary hover:text-foreground">
            +{total - top.length} more in your briefing
          </button>
        ) : null}
      </CardContent>
      <SignalSheet signal={selected} onClose={() => setOpenId(null)} onAcknowledge={acknowledge} onReopen={reopen} onActioned={reload} />
    </Card>
  );
}

export default TodayPanel;
