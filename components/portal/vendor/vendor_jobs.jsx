"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  Loader2,
  MapPin,
  MessageSquarePlus,
  PauseCircle,
  Phone,
  PlayCircle,
  Receipt,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Field, ScreenHeader, SearchInput, StatsBar, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { BILL_APPROVAL_MAP, ENTRY_PERMISSION_OPTIONS, REQUEST_STATUS_MAP } from "@/lib/portal/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { Segmented } from "../form_bits";
import { DataGate, Notice, Panel, PhotoStrip, PortalEmpty, Row, Rows, Stat, Timeline, UploadButton, fmtDate, fmtDateTime, money, todayISO, usePortalData } from "../portal_kit";
import { InvoiceDialog } from "./vendor_invoices";

const ACCEPT_MAP = {
  Accepted: { label: "Accepted", variant: "success" },
  Declined: { label: "Declined", variant: "danger" },
};
const DONE = ["Completed", "Cancelled"];

// One prompt dialog for the actions that need input (decline, schedule, hold, complete).
function ActionDialog({ action, wo, onClose, onDone }) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(action === "complete" ? todayISO() : wo.scheduledDate || "");
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState(false);
  const cfg = {
    decline: { title: "Decline this job", label: "Reason", cta: "Decline", body: () => ({ action: "decline", reason: text }) },
    schedule: { title: "Schedule the job", label: "Note for the office (optional)", cta: "Schedule", body: () => ({ action: "status", status: "Scheduled", scheduledDate: date, note: text }) },
    hold: { title: "Put on hold", label: "What are you waiting on?", cta: "Put on hold", body: () => ({ action: "status", status: "On hold", reason: text, note: text }) },
    complete: { title: "Mark complete", label: "Work performed", cta: "Mark complete", body: () => ({ action: "complete", notes: text, completedDate: date, photos }) },
  }[action];

  const submit = async () => {
    setBusy(true);
    const res = await portalApi(`/api/portal/vendor/work-orders/${wo.id}`, { method: "PATCH", body: cfg.body() });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(action === "complete" ? "Job marked complete." : "Work order updated.");
    onDone();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
          <DialogDescription>{wo.name}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          {action === "schedule" || action === "complete" ? (
            <Field label={action === "schedule" ? "Date" : "Completed on"} htmlFor="act-date">
              <Input id="act-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          ) : null}
          <Field label={cfg.label} htmlFor="act-text">
            <Textarea id="act-text" rows={3} value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          {action === "complete" ? (
            <Field label="After photos">
              <div className="space-y-2">
                <PhotoStrip photos={photos} onRemove={(i) => setPhotos(photos.filter((_, x) => x !== i))} />
                <UploadButton purpose="work_order" multiple accept="image/*" onUploaded={(f) => setPhotos([...photos, ...f])} />
              </div>
            </Field>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {cfg.cta}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function JobSheet({ wo, perms, onClose, onChanged, onInvoice }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState("");
  const [prompt, setPrompt] = useState(null);
  if (!wo) return null;
  const done = DONE.includes(wo.status);

  const patch = async (key, body, success) => {
    setBusy(key);
    const res = await portalApi(`/api/portal/vendor/work-orders/${wo.id}`, { method: "PATCH", body });
    setBusy("");
    if (!res.ok) return toast.error(res.error);
    toast.success(success);
    onChanged();
    return true;
  };
  const addPhotos = (field) => (files) => patch(field, { action: "photos", field, photos: files }, "Photos added.");
  const sendNote = async () => {
    if (await patch("note", { action: "note", body: note }, "Note added.")) setNote("");
  };

  const entry = ENTRY_PERMISSION_OPTIONS.find((o) => o.value === wo.access.entryPermission)?.label;
  const mapUrl = wo.property.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wo.property.address)}` : "";

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-border bg-background sm:max-w-lg">
        <SheetHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <StatusPill status={wo.status} map={REQUEST_STATUS_MAP} />
            {wo.acceptance ? <StatusPill status={wo.acceptance} map={ACCEPT_MAP} /> : null}
            {wo.emergency ? <StatusPill status="Emergency" map={{ Emergency: { label: "Emergency", variant: "danger" } }} /> : null}
          </div>
          <SheetTitle className="text-lg">{wo.name}</SheetTitle>
          <SheetDescription>
            {[wo.property.name, wo.unit ? `Unit ${wo.unit}` : null].filter(Boolean).join(" · ")}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-4">
          {!done ? (
            <div className="flex flex-wrap gap-2">
              {perms.acceptWork && !wo.acceptance ? (
                <>
                  <Button size="sm" onClick={() => patch("accept", { action: "accept" }, "Job accepted.")} disabled={busy === "accept"} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    <ThumbsUp className="h-4 w-4" /> Accept
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPrompt("decline")} className="border-border bg-surface-card hover:bg-surface-hover">
                    <ThumbsDown className="h-4 w-4" /> Decline
                  </Button>
                </>
              ) : null}
              <Button size="sm" variant="outline" onClick={() => setPrompt("schedule")} className="border-border bg-surface-card hover:bg-surface-hover">
                <CalendarCheck className="h-4 w-4" /> {wo.scheduledDate ? "Reschedule" : "Schedule"}
              </Button>
              {wo.status !== "In progress" ? (
                <Button size="sm" variant="outline" onClick={() => patch("start", { action: "status", status: "In progress" }, "Marked in progress.")} disabled={busy === "start"} className="border-border bg-surface-card hover:bg-surface-hover">
                  <PlayCircle className="h-4 w-4" /> Start
                </Button>
              ) : null}
              {wo.status !== "On hold" ? (
                <Button size="sm" variant="outline" onClick={() => setPrompt("hold")} className="border-border bg-surface-card hover:bg-surface-hover">
                  <PauseCircle className="h-4 w-4" /> Hold
                </Button>
              ) : null}
              <Button size="sm" onClick={() => setPrompt("complete")} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <CheckCircle2 className="h-4 w-4" /> Complete
              </Button>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <Stat label="Category">{[wo.category, wo.subcategory].filter(Boolean).join(" · ") || "—"}</Stat>
            <Stat label="Priority">{wo.priority}</Stat>
            <Stat label="Scheduled">{wo.scheduledDate ? fmtDate(wo.scheduledDate) : "Not yet"}</Stat>
            <Stat label="Due">{wo.dueDate ? fmtDate(wo.dueDate) : "—"}</Stat>
          </div>
          {wo.description ? <p className="whitespace-pre-wrap text-sm text-text-secondary">{wo.description}</p> : null}

          <div className="space-y-2 rounded-xl border border-border bg-surface-subtle p-3 text-sm">
            {wo.property.address ? (
              <a href={mapUrl} target="_blank" rel="noreferrer" className="flex items-start gap-2 text-foreground hover:underline">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" /> {wo.property.address}
              </a>
            ) : null}
            <p className="text-text-secondary">Entry: {entry || "Coordinate with the office"}</p>
            {wo.access.preferredTimes.length ? <p className="text-text-secondary">Best times: {wo.access.preferredTimes.join(", ")}</p> : null}
            {wo.access.petsPresent ? <p className="text-text-secondary">Pets on site{wo.access.petDetails ? `: ${wo.access.petDetails}` : ""}</p> : null}
            {wo.access.gateCode ? <p className="text-text-secondary">Gate / building code: {wo.access.gateCode}</p> : null}
            {wo.access.keyLocation ? <p className="text-text-secondary">Keys: {wo.access.keyLocation}</p> : null}
            {wo.access.accessNotes ? <p className="whitespace-pre-wrap text-text-secondary">{wo.access.accessNotes}</p> : null}
            {wo.tenant ? (
              <p className="flex flex-wrap items-center gap-2 text-foreground">
                <Phone className="h-4 w-4 text-text-tertiary" /> {wo.tenant.name}
                {wo.tenant.phone ? (
                  <a href={`tel:${wo.tenant.phone}`} className="text-text-secondary hover:text-foreground">
                    {wo.tenant.phone}
                  </a>
                ) : null}
              </p>
            ) : null}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Before photos</p>
              {!done ? <UploadButton purpose="work_order" multiple accept="image/*" label="Add" onUploaded={addPhotos("photos")} className="h-7 px-2 text-xs" /> : null}
            </div>
            {wo.photos.length ? <PhotoStrip photos={wo.photos} /> : <p className="text-sm text-text-tertiary">No photos yet.</p>}
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">After photos</p>
              <UploadButton purpose="work_order" multiple accept="image/*" label="Add" onUploaded={addPhotos("afterPhotos")} className="h-7 px-2 text-xs" />
            </div>
            {wo.afterPhotos.length ? <PhotoStrip photos={wo.afterPhotos} /> : <p className="text-sm text-text-tertiary">No photos yet.</p>}
          </div>

          {wo.completionNotes ? (
            <div>
              <p className="mb-1 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Completion notes</p>
              <p className="whitespace-pre-wrap text-sm text-text-secondary">{wo.completionNotes}</p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Notes</p>
            {wo.notes.length ? (
              <div className="space-y-2">
                {wo.notes.map((n) => (
                  <div key={n.id} className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
                    <p className="whitespace-pre-wrap text-sm text-foreground">{n.body}</p>
                    <p className="mt-1 text-[11px] text-text-tertiary">{fmtDateTime(n.at)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            <div className="mt-2 space-y-2">
              <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the office…" />
              <div className="flex justify-end">
                <Button size="sm" onClick={sendNote} disabled={busy === "note" || !note.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  {busy === "note" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />} Add Note
                </Button>
              </div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Invoices</p>
              {perms.invoices ? (
                <Button size="sm" variant="outline" onClick={() => onInvoice(wo.id)} className="h-7 border-border bg-surface-card px-2 text-xs hover:bg-surface-hover">
                  <Receipt className="h-3.5 w-3.5" /> Submit Invoice
                </Button>
              ) : null}
            </div>
            {wo.invoices.length ? (
              <div className="space-y-2">
                {wo.invoices.map((i) => (
                  <div key={i.id} className="flex items-center justify-between rounded-lg border border-border bg-surface-subtle px-3 py-2 text-sm">
                    <span className="truncate text-foreground">{i.invoiceNumber ? `#${i.invoiceNumber}` : i.name}</span>
                    <span className="flex items-center gap-2">
                      <StatusPill status={i.approvalStatus} map={BILL_APPROVAL_MAP} />
                      <span className="tabular-nums">{money(i.amount)}</span>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-text-tertiary">No invoices for this job.</p>
            )}
          </div>

          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">History</p>
            <Timeline items={wo.timeline} map={REQUEST_STATUS_MAP} />
          </div>
        </div>
        {prompt ? (
          <ActionDialog
            action={prompt}
            wo={wo}
            onClose={() => setPrompt(null)}
            onDone={() => {
              setPrompt(null);
              onChanged();
            }}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

export function VendorJobs({ member }) {
  const state = usePortalData("/api/portal/vendor/work-orders");
  const [filter, setFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [invoiceFor, setInvoiceFor] = useState(null);
  const rows = useMemo(() => state.data?.workOrders || [], [state.data]);
  const perms = state.data?.permissions || {};
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((w) => {
      const done = DONE.includes(w.status);
      if (filter === "active" && done) return false;
      if (filter === "done" && !done) return false;
      return !q || `${w.name} ${w.property.name} ${w.unit} ${w.category}`.toLowerCase().includes(q);
    });
  }, [rows, filter, search]);

  const stats = useMemo(() => {
    const today = todayISO();
    const month = today.slice(0, 7);
    const active = rows.filter((w) => !DONE.includes(w.status));
    return [
      { label: "Active jobs", value: String(active.length), footer: `${active.filter((w) => w.emergency).length} emergency` },
      { label: "Scheduled today", value: String(active.filter((w) => w.scheduledDate === today).length), footer: "On your calendar" },
      { label: "Need a response", value: String(active.filter((w) => !w.acceptance).length), footer: "Accept or decline" },
      { label: "Done this month", value: String(rows.filter((w) => w.status === "Completed" && String(w.completedDate).startsWith(month)).length), footer: "Completed jobs" },
    ];
  }, [rows]);

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Work orders" description={`Jobs assigned to ${member.name || "you"}. Update status, add photos and notes, and invoice when you're done.`} />
      <DataGate state={state}>
        {() => (
          <>
            <StatsBar stats={stats} />
            <Toolbar>
              <Segmented value={filter} onChange={setFilter} options={[{ value: "active", label: "Active" }, { value: "done", label: "Completed" }, { value: "all", label: "All" }]} />
              <SearchInput value={search} onChange={setSearch} placeholder="Search jobs…" className="w-full sm:w-64" />
            </Toolbar>
            {!rows.length ? (
              <PortalEmpty icon={ClipboardList} title="No work orders yet" description="Jobs the office assigns to you will show up here." />
            ) : !filtered.length ? (
              <PortalEmpty
                icon={ClipboardList}
                title="No jobs match"
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
                      meta={[w.property.name, w.unit ? `Unit ${w.unit}` : null, w.scheduledDate ? `Scheduled ${fmtDate(w.scheduledDate)}` : `Created ${fmtDate(w.createdAt)}`].filter(Boolean).join(" · ")}
                      aside={
                        <>
                          {w.emergency ? <span className="hidden text-xs font-medium text-red-600 dark:text-red-400 sm:inline">Emergency</span> : null}
                          <StatusPill status={w.status} map={REQUEST_STATUS_MAP} />
                        </>
                      }
                    />
                  ))}
                </Rows>
              </Panel>
            )}
            {perms.acceptWork === false ? <Notice>Accepting or declining jobs is handled by the office for your account.</Notice> : null}
          </>
        )}
      </DataGate>
      {openId ? (
        <JobSheet
          key={openId}
          wo={rows.find((w) => w.id === openId) || null}
          perms={perms}
          onClose={() => setOpenId(null)}
          onChanged={state.reload}
          onInvoice={(id) => setInvoiceFor(id)}
        />
      ) : null}
      {invoiceFor ? (
        <InvoiceDialog
          open
          onOpenChange={(o) => !o && setInvoiceFor(null)}
          workOrders={rows}
          workOrderId={invoiceFor}
          onSubmitted={() => {
            setInvoiceFor(null);
            state.reload();
          }}
        />
      ) : null}
    </MainScreenWrapper>
  );
}

export default VendorJobs;
