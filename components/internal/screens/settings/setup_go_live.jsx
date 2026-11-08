"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpRight, CheckCircle2, Circle, CircleHelp, Loader2, MinusCircle, Rocket, Undo2 } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Input } from "@geiger/ui/input";
import { Progress } from "@geiger/ui/progress";
import { Switch } from "@geiger/ui/switch";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { ScreenHeader, SectionCard, SettingRow, SettingsList } from "@/components/internal/shared/screen_kit";
import { AttentionList } from "@/components/internal/shared/overview_kit";
import { usePermission } from "@/context/rbac-context";
import { useWorkspaceUrl } from "@/lib/hooks/use-workspace-url";
import { cn } from "@/lib/utils";
import { DEFAULT_HELP_LINK, helpUrl } from "@/lib/onboarding/steps";
import { dismissCard, goLive, markDone, reopenSetup, restoreCard, safeLink, setHelpLink, setNewPortfolio, skipStep, unmarkDone, unskipStep } from "@/lib/onboarding/state";
import { useOnboarding } from "@/lib/onboarding/use_onboarding";

// Settings → Setup & Go-live: the "Get started" checklist with computed status, deep links, skip and go-live (INTL-03).

const STATUS_ICON = {
  done: <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />,
  skipped: <MinusCircle className="h-5 w-5 text-text-tertiary" />,
  unknown: <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />,
  todo: <Circle className="h-5 w-5 text-text-tertiary" />,
};

function SkipDialog({ step, onClose, onConfirm }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    await onConfirm(step, reason);
    setBusy(false);
    setReason("");
  };
  return (
    <Dialog open={Boolean(step)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Skip {step?.title?.toLowerCase()}?</DialogTitle>
          <DialogDescription>It stays on the list as skipped, and you can bring it back any time.</DialogDescription>
        </DialogHeader>
        <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why? (optional)" aria-label="Reason for skipping" maxLength={160} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Skip step
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepRow({ step, index, canManage, busy, onOpen, onSkip, onUndo, onTick, onGoLive, onReopen, canGoLive, live }) {
  const help = helpUrl(step.helpSlug);
  const isGoLive = step.id === "go_live";
  const open = step.status === "todo" || step.status === "unknown";
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="mt-0.5 shrink-0">{STATUS_ICON[step.status]}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-foreground">
              {index + 1}. {step.title}
            </span>
            {!step.required ? <Badge variant="outline">Optional</Badge> : null}
            {step.status === "skipped" ? <Badge variant="neutral">Skipped</Badge> : null}
          </div>
          <p className={cn("mt-0.5 text-xs", step.status === "unknown" ? "text-amber-700 dark:text-amber-400" : "text-text-secondary")}>{step.detail}</p>
          {open ? <p className="mt-0.5 text-xs text-text-tertiary">{step.why}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 pl-8 sm:pl-0">
        {isGoLive ? (
          live ? (
            <Button size="sm" variant="outline" disabled={!canManage || busy} onClick={onReopen}>
              <Undo2 className="h-3.5 w-3.5" /> Reopen setup
            </Button>
          ) : (
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canManage || !canGoLive || busy} onClick={onGoLive} title={canGoLive ? undefined : "Finish the required steps first"}>
              <Rocket className="h-3.5 w-3.5" /> Mark as live
            </Button>
          )
        ) : (
          <>
            {step.status === "skipped" && canManage ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onUndo}>
                <Undo2 className="h-3.5 w-3.5" /> Bring back
              </Button>
            ) : null}
            {step.status === "done" && !step.auto && canManage ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onUndo}>
                <Undo2 className="h-3.5 w-3.5" /> Undo
              </Button>
            ) : null}
            {open && step.manual && canManage ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onTick}>
                Mark done
              </Button>
            ) : null}
            {open && step.skippable && canManage ? (
              <Button size="sm" variant="ghost" disabled={busy} onClick={onSkip}>
                Skip
              </Button>
            ) : null}
            <Button size="sm" variant="outline" onClick={onOpen}>
              Open <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </>
        )}
        {help ? (
          <a href={help} target="_blank" rel="noopener noreferrer" aria-label={`Help: ${step.title}`} title="Open the help article" className="flex h-8 w-8 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-active hover:text-foreground">
            <CircleHelp className="h-4 w-4" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

export function SetupGoLiveScreen() {
  const { setTab } = useWorkspaceUrl();
  const canManage = usePermission("settings.manage");
  const { loading, unavailable, state, results, progress, update } = useOnboarding();
  const [skipping, setSkipping] = useState(null);
  const [busy, setBusy] = useState(false);
  const [helpDraft, setHelpDraft] = useState(null);

  const run = async (reducer, message) => {
    setBusy(true);
    const ok = await update(reducer, message);
    setBusy(false);
    return ok;
  };

  if (loading) {
    return (
      <MainScreenWrapper>
        <ScreenHeader title="Setup & Go-live" description="Get from sign-up to running: work down this list, then go live." />
        <div className="flex justify-center py-16">
          <LogoLoading size={56} aria-label="Loading your setup checklist" />
        </div>
      </MainScreenWrapper>
    );
  }

  const live = Boolean(state?.goLiveAt);
  const openRequired = results.filter((r) => r.required && r.id !== "go_live" && !r.complete);
  const helpLink = safeLink(state?.helpLink) || DEFAULT_HELP_LINK;
  const byTitle = Object.fromEntries(results.map((r) => [r.title, r]));

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Setup & Go-live"
        description="Get from sign-up to running: work down this list, then go live. Each step checks your data, so it ticks itself when the work is done."
        actions={
          <Button asChild variant="outline">
            <a href={helpLink} target="_blank" rel="noopener noreferrer">
              <CircleHelp className="h-4 w-4" /> Book onboarding help
            </a>
          </Button>
        }
      />

      {unavailable ? (
        <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">Your setup progress couldn&apos;t be loaded. Try again in a moment.</p>
      ) : (
        <>
          {!canManage ? <p className="rounded-lg border border-border bg-surface-card px-4 py-3 text-sm text-text-secondary">View only — your role can&apos;t skip steps, dismiss the card or go live.</p> : null}

          <SectionCard
            title={live ? "You're live" : "Progress"}
            description={live ? "This project is live. The checklist stays here for reference." : `${progress.done} of ${progress.total} steps done${progress.next[0] ? ` — next up: ${progress.next[0].title}.` : "."}`}
          >
            <Progress value={progress.percent} aria-label="Setup progress" />
            <div className="mt-4">
              <SettingsList>
                <SettingRow
                  title="New portfolio"
                  description="Starting from scratch with no history to bring over. Skips the opening balances step."
                  control={<Switch checked={Boolean(state?.newPortfolio)} disabled={!canManage || busy} onCheckedChange={(v) => run((s) => setNewPortfolio(s, Boolean(v)))} aria-label="New portfolio" />}
                />
                <SettingRow
                  title="Show the Get started card on Overview"
                  description="The card sits at the top of Overview for everyone until you dismiss it or go live."
                  control={<Switch checked={!state?.dismissedAt} disabled={!canManage || busy || live} onCheckedChange={(v) => run((s) => (v ? restoreCard(s) : dismissCard(s)))} aria-label="Show the Get started card" />}
                />
              </SettingsList>
            </div>
          </SectionCard>

          {!live && openRequired.length ? (
            <SectionCard title="Needed before go-live" description="Required steps still open.">
              <AttentionList
                items={openRequired.map((r) => ({ key: r.id, label: r.title, detail: r.detail, tone: r.status === "unknown" ? "danger" : "warning", section: r.title }))}
                onNavigate={(title) => byTitle[title] && setTab(byTitle[title].screen)}
              />
            </SectionCard>
          ) : null}

          <SectionCard title="Checklist" description="In the order most teams set up. Optional steps can be skipped.">
            <ul className="divide-y divide-border">
              {results.map((step, i) => (
                <StepRow
                  key={step.id}
                  step={step}
                  index={i}
                  canManage={canManage}
                  busy={busy}
                  live={live}
                  canGoLive={!openRequired.length}
                  onOpen={() => setTab(step.screen)}
                  onSkip={() => setSkipping(step)}
                  onUndo={() => run((s) => unmarkDone(unskipStep(s, step.id), step.id))}
                  onTick={() => run((s) => markDone(s, step.id))}
                  onGoLive={() => run((s) => goLive(s), "Marked live — the Get started card is now hidden.")}
                  onReopen={() => run((s) => reopenSetup(s))}
                />
              ))}
            </ul>
          </SectionCard>

          {canManage ? (
            <SectionCard title="Onboarding help link" description="Where Book onboarding help goes — a booking page URL or a mailto: address. Blank uses the Geiger contact page.">
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input value={helpDraft ?? state?.helpLink ?? ""} onChange={(e) => setHelpDraft(e.target.value)} placeholder={DEFAULT_HELP_LINK} aria-label="Onboarding help link" />
                <Button variant="outline" disabled={busy || helpDraft === null || helpDraft === (state?.helpLink ?? "")} onClick={async () => (await run((s) => setHelpLink(s, helpDraft), "Help link saved.")) && setHelpDraft(null)}>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Save link
                </Button>
              </div>
            </SectionCard>
          ) : null}
        </>
      )}

      <SkipDialog
        step={skipping}
        onClose={() => setSkipping(null)}
        onConfirm={async (step, reason) => {
          if (await run((s) => skipStep(s, step.id, reason))) setSkipping(null);
        }}
      />
    </MainScreenWrapper>
  );
}

export default SetupGoLiveScreen;
