"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, CheckCircle2, Loader2, Wrench, XCircle } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Textarea } from "@geiger/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { Field, ScreenHeader, SearchInput, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { APPROVAL_STATUS_MAP, CLOSED_REQUEST_STATUSES, REQUEST_STATUS_MAP } from "@/lib/portal/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { Segmented } from "../form_bits";
import { DataGate, Notice, Panel, PhotoStrip, PortalEmpty, Row, Rows, Stat, fmtDate, fmtDateTime, money, usePortalData } from "../portal_kit";

function DecisionDialog({ target, onClose, onDone }) {
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  if (!target) return null;
  const approve = target.decision === "Approved";

  const submit = async () => {
    if (!approve && !notes.trim()) return toast.error("Add a reason for rejecting.");
    setBusy(true);
    const res = await portalApi(`/api/portal/owner/work-orders/${target.wo.id}`, { method: "POST", body: { decision: target.decision, notes } });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(approve ? "Approved — the office has been notified." : "Rejection sent to the office.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{approve ? "Approve work" : "Reject work"}</DialogTitle>
          <DialogDescription>
            {target.wo.name} · {money(target.wo.approval?.amount)}
          </DialogDescription>
        </DialogHeader>
        <Field label={approve ? "Note (optional)" : "Reason"} htmlFor="dec-notes">
          <Textarea id="dec-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={approve ? "Anything the office should know" : "Why this shouldn't go ahead"} />
        </Field>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={busy}
            className={approve ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-red-600 text-white hover:bg-red-600/90"}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : approve ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {approve ? "Approve" : "Reject"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WorkOrderSheet({ wo, onClose }) {
  if (!wo) return null;
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-border bg-background sm:max-w-lg">
        <SheetHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <StatusPill status={wo.status} map={REQUEST_STATUS_MAP} />
            {wo.approval ? <StatusPill status={wo.approval.status} map={APPROVAL_STATUS_MAP} /> : null}
          </div>
          <SheetTitle className="text-lg">{wo.name}</SheetTitle>
          <SheetDescription>{[wo.propertyName, fmtDate(wo.createdAt)].filter(Boolean).join(" · ")}</SheetDescription>
        </SheetHeader>
        <div className="space-y-6 p-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Category">{wo.category || "—"}</Stat>
            <Stat label="Priority">{wo.priority}</Stat>
            <Stat label="Vendor">{wo.vendorName || "Not assigned"}</Stat>
            <Stat label="Scheduled">{wo.scheduledDate ? fmtDate(wo.scheduledDate) : "—"}</Stat>
            <Stat label="Cost to date">{money(wo.totalCost)}</Stat>
            {wo.approval ? <Stat label="Amount for approval">{money(wo.approval.amount)}</Stat> : null}
          </div>
          {wo.description ? <p className="whitespace-pre-wrap text-sm text-text-secondary">{wo.description}</p> : null}
          <PhotoStrip photos={wo.photos} />
          {wo.approval?.history?.length ? (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Approval history</p>
              <div className="space-y-2">
                {wo.approval.history.map((h) => (
                  <div key={h.id} className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
                    <p className="text-sm text-foreground">
                      {h.action} · {money(h.amount)}
                    </p>
                    <p className="mt-0.5 text-[11px] text-text-tertiary">
                      {h.by} · {fmtDateTime(h.at)}
                      {h.notes ? ` — ${h.notes}` : ""}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function OwnerMaintenance() {
  const state = usePortalData("/api/portal/owner/work-orders");
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [decision, setDecision] = useState(null);
  const [openId, setOpenId] = useState(null);
  const rows = useMemo(() => state.data?.workOrders || [], [state.data]);
  const pending = rows.filter((w) => w.approval?.status === "Pending");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((w) => {
      const closed = CLOSED_REQUEST_STATUSES.includes(w.status);
      if (filter === "open" && closed) return false;
      if (filter === "closed" && !closed) return false;
      return !q || `${w.name} ${w.propertyName} ${w.category} ${w.vendorName}`.toLowerCase().includes(q);
    });
  }, [rows, filter, search]);
  const canApprove = state.data?.permissions?.approve !== false;

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Maintenance & approvals" description="Work on your properties, and jobs above your approval limit waiting for your decision." />
      <DataGate state={state}>
        {(data) => (
          <>
            {pending.length ? (
              <Panel title="Waiting for your approval" description={canApprove ? "Approve or reject — the office is notified right away." : "The office handles approvals for your account."} flush>
                <Rows>
                  {pending.map((w) => (
                    <div key={w.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                      <button type="button" onClick={() => setOpenId(w.id)} className="min-w-0 text-left">
                        <p className="truncate text-sm font-medium text-foreground">{w.name}</p>
                        <p className="mt-0.5 truncate text-xs text-text-tertiary">
                          {[w.propertyName, money(w.approval.amount), w.approval.dueDate ? `Decide by ${fmtDate(w.approval.dueDate)}` : null].filter(Boolean).join(" · ")}
                        </p>
                      </button>
                      {canApprove ? (
                        <div className="flex shrink-0 gap-2">
                          <Button variant="outline" size="sm" onClick={() => setDecision({ wo: w, decision: "Rejected" })} className="border-border bg-surface-card hover:bg-surface-hover">
                            <XCircle className="h-4 w-4" /> Reject
                          </Button>
                          <Button size="sm" onClick={() => setDecision({ wo: w, decision: "Approved" })} className="bg-primary text-primary-foreground hover:bg-primary/90">
                            <CheckCircle2 className="h-4 w-4" /> Approve
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </Rows>
              </Panel>
            ) : data.workOrders.length ? (
              <Notice icon={BadgeCheck} tone="success">Nothing is waiting for your approval.</Notice>
            ) : null}

            {!data.permissions.workOrders ? (
              <Notice>The full work-order list isn&apos;t shared for your account — you&apos;ll still see anything needing your approval.</Notice>
            ) : null}

            <Toolbar>
              <Segmented value={filter} onChange={setFilter} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
              <SearchInput value={search} onChange={setSearch} placeholder="Search work orders…" className="w-full sm:w-64" />
            </Toolbar>
            {!rows.length ? (
              <PortalEmpty icon={Wrench} title="No work orders" description="Maintenance on your properties will appear here." />
            ) : !filtered.length ? (
              <PortalEmpty
                icon={Wrench}
                title="No work orders match"
                description="Try another filter or search."
                action={<Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => { setFilter("all"); setSearch(""); }}>Clear Filters</Button>}
              />
            ) : (
              <Panel flush>
                <Rows>
                  {filtered.map((w) => (
                    <Row
                      key={w.id}
                      onClick={() => setOpenId(w.id)}
                      title={w.name}
                      meta={[w.propertyName, w.category, fmtDate(w.createdAt), w.totalCost ? money(w.totalCost) : null].filter(Boolean).join(" · ")}
                      aside={<StatusPill status={w.status} map={REQUEST_STATUS_MAP} />}
                    />
                  ))}
                </Rows>
              </Panel>
            )}
          </>
        )}
      </DataGate>
      <DecisionDialog
        key={decision ? `${decision.wo.id}:${decision.decision}` : "none"}
        target={decision}
        onClose={() => setDecision(null)}
        onDone={() => {
          setDecision(null);
          state.reload();
        }}
      />
      <WorkOrderSheet wo={rows.find((w) => w.id === openId) || null} onClose={() => setOpenId(null)} />
    </MainScreenWrapper>
  );
}

export default OwnerMaintenance;
