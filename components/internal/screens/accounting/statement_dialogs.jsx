"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CircleCheck, FileText, Loader2, Mail, Printer } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Field } from "@/components/internal/shared/screen_kit";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@geiger/ui/select";
import { RoleGate, RoleNote } from "@/components/internal/shared/role_gate";
import { usePermission } from "@/context/rbac-context";
import { printStatementsApi, sendStatementsApi, statementApi } from "@/lib/billing/api";
import { addPeriods, periodLabel } from "@/lib/billing/periods";
import { cn } from "@/lib/utils";
import { SummaryTiles } from "./sections";
import { money } from "./shared";

// Resident statements (CORE-12): one lease's statement (preview, print, email) and the Rent Collection bulk send with its print batch.

export const SEND_PERMISSION = "property.rent.manage";
export const PRINT_PERMISSION = "property.report.export";
const NO_SEND = "Your role can't send resident statements.";
const NO_PRINT = "Your role can't print statements.";

const thisMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

// The current month (to date) and the 12 before it; the default is last month.
function monthOptions() {
  const now = thisMonth();
  return Array.from({ length: 13 }, (_, i) => {
    const p = addPeriods(now, -i);
    return { value: p, label: i === 0 ? `${periodLabel(p)} (to date)` : periodLabel(p) };
  });
}
const defaultMonth = () => addPeriods(thisMonth(), -1);

// Open an HTML page in a new tab; the tab opens first so the browser doesn't block it.
async function openHtml(load) {
  const win = window.open("", "_blank");
  const res = await load();
  if (!res.ok) {
    win?.close();
    toast.error(res.error || "Couldn't load the statement.");
    return false;
  }
  const url = URL.createObjectURL(new Blob([res.html], { type: "text/html;charset=utf-8" }));
  if (win) win.location.href = url;
  else window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}

// What a send did, in a sentence.
export function statementSendText(s) {
  if (!s) return "";
  const parts = [
    s.sent ? `${s.sent} emailed` : "",
    s.duplicate ? `${s.duplicate} already sent` : "",
    s.disabled ? `${s.disabled} not sent (statement emails are off in Notifications)` : "",
    s.notConfigured ? `${s.notConfigured} not sent (email isn't set up)` : "",
    s.failed ? `${s.failed} failed` : "",
    s.noAddress ? `${s.noAddress} with no email on file` : "",
    s.print ? `${s.print} for the print batch` : "",
    s.excluded + s.dnc ? `${s.excluded + s.dnc} get no statements` : "",
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")}.` : "Nothing to send.";
}

function MonthSelect({ id, value, onChange }) {
  const options = useMemo(() => monthOptions(), []);
  return (
    <Field label="Month" htmlFor={id}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="bg-surface-card">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

// One lease's statement for a month: figures, the page itself, who it goes to, then Print or Email.
export function StatementDialog({ open, onOpenChange, leaseId }) {
  const [period, setPeriod] = useState(defaultMonth);
  const [loaded, setLoaded] = useState(null);
  const [sending, setSending] = useState(false);
  const canSend = usePermission(SEND_PERMISSION);
  const canPrint = usePermission(PRINT_PERMISSION);

  useEffect(() => {
    if (!open || !leaseId) return undefined;
    let alive = true;
    statementApi(leaseId, period).then((res) => alive && setLoaded({ ...res, key: `${leaseId}:${period}` }));
    return () => {
      alive = false;
    };
  }, [open, leaseId, period]);
  const state = loaded?.key === `${leaseId}:${period}` ? loaded : null;
  const st = state?.ok ? state.statement : null;
  const emails = (st?.recipients || []).filter((r) => r.email && !r.dnc && ["email", "both"].includes(r.delivery));

  const send = async (resend = false) => {
    setSending(true);
    const res = await sendStatementsApi({ leaseIds: [leaseId], period, resend });
    setSending(false);
    if (!res.ok) return toast.error(res.error || "Couldn't send the statement.");
    const s = res.summary;
    if (s.duplicate && !s.sent && !resend) {
      toast(`This statement was already emailed for ${res.label}.`, { action: { label: "Send Again", onClick: () => send(true) } });
      return;
    }
    if (s.sent) toast.success(statementSendText(s));
    else toast.warning(statementSendText(s));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Resident statement</DialogTitle>
          <DialogDescription>Charges, payments and the balance for a month, from the ledger. Nothing posts.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="sm:w-64">
            <MonthSelect id="st-month" value={period} onChange={setPeriod} />
          </div>
          {!state ? (
            <div className="flex justify-center py-12">
              <LogoLoading size={40} aria-label="Loading statement" />
            </div>
          ) : !state.ok ? (
            <p className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">{state.error || "Couldn't load the statement."}</p>
          ) : (
            <>
              <SummaryTiles
                items={[
                  { label: "Opening", value: money(st.opening) },
                  { label: "Charges", value: money(st.charges) },
                  { label: "Payments & credits", value: money(st.payments + st.credits) },
                  st.closing < 0
                    ? { label: "Credit on account", value: money(st.credit), className: "text-emerald-600 dark:text-emerald-400" }
                    : { label: "Closing balance", value: money(st.closing), className: st.closing > 0 ? "text-red-600 dark:text-red-400" : "text-foreground" },
                ]}
              />
              <iframe title="Statement preview" srcDoc={state.html} sandbox="" className="h-[360px] w-full rounded-lg border border-border bg-white" />
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Goes to</p>
                {(st.recipients || []).map((r) => (
                  <p key={r.key} className="flex flex-wrap items-center gap-x-2 text-sm text-text-secondary">
                    <span className="font-medium text-foreground">{r.name || "Resident"}</span>
                    {r.dnc ? "· Do not contact" : r.delivery === "none" ? "· No statements" : r.delivery === "mail" ? "· Paper" : r.email ? `· ${r.email}${r.delivery === "both" ? " and paper" : ""}` : "· No email on file"}
                  </p>
                ))}
              </div>
              {!canSend ? <RoleNote>{NO_SEND}</RoleNote> : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <RoleGate allowed={canPrint} reason={NO_PRINT}>
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" disabled={!st || !canPrint} onClick={() => openHtml(async () => ({ ok: true, html: state.html }))}>
              <Printer className="h-4 w-4" /> Print
            </Button>
          </RoleGate>
          <RoleGate allowed={canSend} reason={NO_SEND}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!st || !canSend || sending || !emails.length} onClick={() => send(false)}>
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Email Statement
            </Button>
          </RoleGate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// A lease's line in the bulk dialog: how its statement goes out.
function deliveryLine(item) {
  if (!item) return "";
  const list = item.recipients || [];
  const by = (s) => list.filter((r) => r.status === s);
  const parts = [
    by("pending").length ? (by("pending").length === 1 ? by("pending")[0].email : `${by("pending").length} emails`) : "",
    by("duplicate").length ? "Already emailed" : "",
    by("print").length ? "Paper" : "",
    by("no_address").length ? "No email on file" : "",
  ].filter(Boolean);
  return parts.join(" · ") || "No statements";
}

// Rent Collection → Send Statements (mounted when opened): the accounts in the current view, one statement per lease, a month, then send the emails and print the paper ones.
export function SendStatementsDialog({ open, onOpenChange, rows, viewLabel }) {
  const leases = useMemo(() => {
    const seen = new Map();
    for (const r of rows || []) if (r.leaseId && !seen.has(r.leaseId)) seen.set(r.leaseId, r);
    return [...seen.values()];
  }, [rows]);
  const ids = useMemo(() => leases.map((r) => r.leaseId), [leases]);
  const [period, setPeriod] = useState(defaultMonth);
  const [picked, setPicked] = useState(() => new Set(ids));
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState("");
  const [done, setDone] = useState(null);
  const canSend = usePermission(SEND_PERMISSION);
  const canPrint = usePermission(PRINT_PERMISSION);
  const key = `${period}:${ids.join(",")}`;

  useEffect(() => {
    if (!open || !ids.length) return undefined;
    let alive = true;
    sendStatementsApi({ leaseIds: ids, period, dryRun: true }).then((res) => alive && setPreview({ ...res, key }));
    return () => {
      alive = false;
    };
  }, [open, period, ids, key]);
  const state = preview?.key === key ? preview : null;
  const byLease = useMemo(() => new Map((state?.leases || []).map((l) => [l.leaseId, l])), [state]);
  const chosen = ids.filter((id) => picked.has(id));
  const toEmail = chosen.filter((id) => byLease.get(id)?.recipients?.some((r) => r.status === "pending")).length;
  const toPrint = chosen.filter((id) => byLease.get(id)?.recipients?.some((r) => r.status === "print"));
  const toggle = (id, on) => setPicked((prev) => new Set(on ? [...prev, id] : [...prev].filter((x) => x !== id)));

  const print = async (leaseIds) => {
    setBusy("print");
    await openHtml(() => printStatementsApi(leaseIds, period));
    setBusy("");
  };
  const send = async () => {
    setBusy("send");
    const res = await sendStatementsApi({ leaseIds: chosen, period });
    setBusy("");
    if (!res.ok) return toast.error(res.error || "Couldn't send the statements.");
    setDone(res);
  };

  if (done) {
    const paper = done.printLeaseIds || [];
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Statements sent</DialogTitle>
            <DialogDescription>
              {done.label} · {done.summary.leases} lease{done.summary.leases === 1 ? "" : "s"}
            </DialogDescription>
          </DialogHeader>
          <p className="flex items-start gap-2 text-sm text-text-secondary">
            <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
            {statementSendText(done.summary)}
          </p>
          {paper.length ? <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm text-foreground">{paper.length} resident{paper.length === 1 ? " gets" : "s get"} paper statements. Print the mail batch and post them.</p> : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Done
            </Button>
            {paper.length ? (
              <RoleGate allowed={canPrint} reason={NO_PRINT}>
                <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!canPrint || busy === "print"} onClick={() => print(paper)}>
                  {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
                  Print Mail Batch ({paper.length})
                </Button>
              </RoleGate>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Send statements</DialogTitle>
          <DialogDescription>
            One statement per lease in {viewLabel || "this view"}, emailed with a link to the resident portal. Residents who prefer paper go to the print batch; each resident gets a month&apos;s statement once.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="sm:w-64">
            <MonthSelect id="sts-month" value={period} onChange={setPeriod} />
          </div>
          {!leases.length ? (
            <p className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">No accounts in this view are linked to a lease.</p>
          ) : !state ? (
            <div className="flex justify-center py-10">
              <LogoLoading size={40} aria-label="Loading statements" />
            </div>
          ) : !state.ok ? (
            <p className="rounded-lg border border-border bg-surface-subtle px-4 py-3 text-sm text-text-secondary">{state.error || "Couldn't prepare the statements."}</p>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 text-sm text-text-secondary">
                <label className="flex items-center gap-2">
                  <Checkbox checked={chosen.length === ids.length} onCheckedChange={(v) => setPicked(new Set(v ? ids : []))} /> {chosen.length} of {ids.length} selected
                </label>
                <span>
                  {toEmail} to email · {toPrint.length} on paper
                </span>
              </div>
              <div className="max-h-80 divide-y divide-border overflow-y-auto rounded-lg border border-border">
                {leases.map((r) => {
                  const item = byLease.get(r.leaseId);
                  return (
                    <label key={r.leaseId} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-surface-hover">
                      <Checkbox checked={picked.has(r.leaseId)} onCheckedChange={(v) => toggle(r.leaseId, Boolean(v))} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{r.name || item?.name || "Lease"}</p>
                        <p className="truncate text-xs text-text-secondary">{[r.tenantName, r.unit, deliveryLine(item)].filter(Boolean).join(" · ")}</p>
                      </div>
                      <span className={cn("shrink-0 text-sm tabular-nums", (item?.closing || 0) > 0 ? "text-red-600 dark:text-red-400" : "text-text-secondary")}>{item ? money(item.closing) : "—"}</span>
                    </label>
                  );
                })}
              </div>
              {!canSend ? <RoleNote>{NO_SEND}</RoleNote> : null}
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <RoleGate allowed={canPrint} reason={NO_PRINT}>
            <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" disabled={!state?.ok || !canPrint || !toPrint.length || busy === "print"} onClick={() => print(toPrint)}>
              {busy === "print" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              Print Mail Batch ({toPrint.length})
            </Button>
          </RoleGate>
          <RoleGate allowed={canSend} reason={NO_SEND}>
            <Button className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={!state?.ok || !canSend || !chosen.length || busy === "send"} onClick={send}>
              {busy === "send" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Send Statements ({chosen.length})
            </Button>
          </RoleGate>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Rent Collection header action: opens the bulk send over the rows the list is showing (its view, filters and search).
export function SendStatementsButton({ rows, view }) {
  const [open, setOpen] = useState(false);
  const canSend = usePermission(SEND_PERMISSION);
  const canPrint = usePermission(PRINT_PERMISSION);
  const allowed = canSend || canPrint;
  return (
    <>
      <RoleGate allowed={allowed} reason={NO_SEND}>
        <Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" disabled={!allowed} onClick={() => setOpen(true)}>
          <FileText className="h-4 w-4" /> Send Statements
        </Button>
      </RoleGate>
      {open ? <SendStatementsDialog open onOpenChange={setOpen} rows={rows} viewLabel={view?.label && view.label !== "All" ? `the ${view.label} view` : "this list"} /> : null}
    </>
  );
}
