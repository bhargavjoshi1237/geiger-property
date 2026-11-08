"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Circle, ListChecks, Loader2, X } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Button } from "@geiger/ui/button";
import { Card, CardContent } from "@geiger/ui/card";
import { Progress } from "@geiger/ui/progress";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { dismissCard } from "@/lib/onboarding/state";
import { useOnboarding } from "@/lib/onboarding/use_onboarding";

// Overview "Get started" card (INTL-03): progress and the next three setup steps, until dismissed or the project goes live.

export function GetStartedCard() {
  const { setTab } = useWorkspaceUrl();
  const canManage = usePermission("settings.manage");
  const { loading, unavailable, closed, results, progress, update } = useOnboarding({ lazy: true });
  const [busy, setBusy] = useState(false);

  // Hidden once dismissed or live, and silent when the saved state can't be read.
  if (!loading && (closed || unavailable)) return null;

  const dismiss = async () => {
    setBusy(true);
    await update((s) => dismissCard(s));
    setBusy(false);
  };

  return (
    <Card className="gap-0 overflow-hidden rounded-xl border-border bg-surface-subtle py-0 text-foreground">
      <CardContent className="p-4">
        <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-surface-card text-muted-foreground">
              <ListChecks className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-foreground">Get started</h3>
              <p className="text-sm text-muted-foreground">
                {loading ? "Checking your setup…" : `${progress.done} of ${progress.total} steps done. Finish the rest to run your portfolio here.`}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setTab("Setup & Go-live")}>
              Open checklist <ArrowRight className="h-3.5 w-3.5" />
            </Button>
            {canManage ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:bg-surface-active hover:text-foreground" disabled={busy || loading} onClick={dismiss} aria-label="Dismiss the Get started card" title="Dismiss for everyone on this project">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </Button>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <LogoLoading size={40} aria-label="Loading your setup checklist" />
          </div>
        ) : (
          <>
            <Progress value={progress.percent} className="mt-4" aria-label="Setup progress" />
            <ul className="mt-2 divide-y divide-border">
              {progress.next.map((step) => (
                <li key={step.id}>
                  <button type="button" onClick={() => setTab(step.screen)} className="group flex w-full items-center gap-3 py-2.5 text-left">
                    <Circle className="h-4 w-4 shrink-0 text-text-tertiary" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{step.title}</span>
                      <span className="block truncate text-xs text-text-secondary">{step.detail}</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-text-tertiary transition-transform group-hover:translate-x-0.5" />
                  </button>
                </li>
              ))}
              {!progress.next.length && results.length ? (
                <li className="flex items-center gap-2 py-2.5 text-sm text-text-secondary">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                  Every step is done — open the checklist to go live.
                </li>
              ) : null}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default GetStartedCard;
