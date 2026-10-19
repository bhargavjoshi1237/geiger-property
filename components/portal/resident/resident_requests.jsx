"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, MessageSquarePlus, Plus, Send, Wrench, XCircle } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@geiger/ui/sheet";
import { Field, ScreenHeader, SearchInput, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import {
  AREA_OPTIONS,
  CATEGORY_OPTIONS,
  ENTRY_PERMISSION_OPTIONS,
  REQUEST_STATUS_MAP,
  TIME_WINDOW_OPTIONS,
} from "@/lib/portal/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { ChipGroup, Segmented, SelectField, SwitchRow } from "../form_bits";
import {
  DataGate,
  Notice,
  Panel,
  PhotoStrip,
  PortalEmpty,
  Row,
  Rows,
  Stat,
  Timeline,
  UploadButton,
  fmtDate,
  fmtDateTime,
  usePortalData,
} from "../portal_kit";

const EMPTY = {
  name: "",
  category: "",
  area: "",
  description: "",
  emergency: false,
  entryPermission: "",
  preferredTimes: [],
  petsPresent: false,
  petDetails: "",
  accessNotes: "",
  photos: [],
};

function NewRequestDialog({ open, onOpenChange, onCreated }) {
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!draft.name.trim()) return toast.error("Describe the problem in a few words.");
    setBusy(true);
    const res = await portalApi("/api/portal/resident/requests", { method: "POST", body: draft });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Request submitted. We'll keep you posted here.");
    setDraft(EMPTY);
    onOpenChange(false);
    onCreated(res.request);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New Maintenance Request</DialogTitle>
          <DialogDescription>Tell us what&apos;s wrong — photos help us send the right technician.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="What's the problem?" htmlFor="rq-name">
            <Input id="rq-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. Kitchen sink is leaking" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="rq-cat">
              <SelectField id="rq-cat" value={draft.category} onChange={set("category")} options={CATEGORY_OPTIONS} />
            </Field>
            <Field label="Where" htmlFor="rq-area">
              <SelectField id="rq-area" value={draft.area} onChange={set("area")} options={AREA_OPTIONS} />
            </Field>
          </div>
          <Field label="Details" htmlFor="rq-desc">
            <Textarea id="rq-desc" rows={4} value={draft.description} onChange={(e) => set("description")(e.target.value)} placeholder="When did it start? Anything you've already tried?" />
          </Field>
          <SwitchRow label="This is an emergency" hint="Flooding, no heat, gas smell, electrical hazard…" checked={draft.emergency} onChange={set("emergency")} />
          {draft.emergency ? (
            <Notice icon={AlertTriangle} tone="warning">
              For fire, gas or anything life-threatening call 911 first, then the office emergency line.
            </Notice>
          ) : null}
          <Field label="Entry permission" htmlFor="rq-entry">
            <SelectField id="rq-entry" value={draft.entryPermission} onChange={set("entryPermission")} options={ENTRY_PERMISSION_OPTIONS} />
          </Field>
          <Field label="Best times">
            <ChipGroup value={draft.preferredTimes} onChange={set("preferredTimes")} options={TIME_WINDOW_OPTIONS} />
          </Field>
          <SwitchRow label="Pets in the home" checked={draft.petsPresent} onChange={set("petsPresent")} />
          {draft.petsPresent ? (
            <Input value={draft.petDetails} onChange={(e) => set("petDetails")(e.target.value)} placeholder="e.g. Friendly dog, will be crated" />
          ) : null}
          <Field label="Access notes" htmlFor="rq-access">
            <Input id="rq-access" value={draft.accessNotes} onChange={(e) => set("accessNotes")(e.target.value)} placeholder="Gate code, parking, anything we should know" />
          </Field>
          <Field label="Photos">
            <div className="space-y-2">
              <PhotoStrip photos={draft.photos} onRemove={(i) => set("photos")(draft.photos.filter((_, x) => x !== i))} />
              <UploadButton purpose="request" multiple accept="image/*" onUploaded={(files) => set("photos")([...draft.photos, ...files])} />
            </div>
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit Request
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RequestSheet({ request, onClose, onUpdated }) {
  const [comment, setComment] = useState("");
  const [photos, setPhotos] = useState([]);
  const [busy, setBusy] = useState("");
  if (!request) return null;

  const act = async (action, body, success) => {
    setBusy(action);
    const res = await portalApi(`/api/portal/resident/requests/${request.id}`, { method: "PATCH", body: { action, ...body } });
    setBusy("");
    if (!res.ok) return toast.error(res.error);
    toast.success(success);
    onUpdated(res.request);
    return true;
  };

  const sendComment = async () => {
    if (await act("comment", { body: comment, photos }, "Update sent to the office.")) {
      setComment("");
      setPhotos([]);
    }
  };

  const entry = ENTRY_PERMISSION_OPTIONS.find((o) => o.value === request.entryPermission)?.label;
  return (
    <Sheet open={Boolean(request)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto border-border bg-background sm:max-w-lg">
        <SheetHeader className="border-b border-border">
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <StatusPill status={request.status} map={REQUEST_STATUS_MAP} />
            {request.emergency ? <StatusPill status="Emergency" map={{ Emergency: { label: "Emergency", variant: "danger" } }} /> : null}
          </div>
          <SheetTitle className="text-lg">{request.name}</SheetTitle>
          <SheetDescription>Submitted {fmtDateTime(request.createdAt)}</SheetDescription>
        </SheetHeader>

        <div className="space-y-6 p-4">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Category">{[request.category, request.subcategory].filter(Boolean).join(" · ") || "—"}</Stat>
            <Stat label="Where">{request.area || "—"}</Stat>
            <Stat label="Scheduled">{request.scheduledDate ? fmtDate(request.scheduledDate) : request.assigned ? "Being scheduled" : "Not yet"}</Stat>
            <Stat label="Entry">{entry || "—"}</Stat>
          </div>
          {request.description ? <p className="whitespace-pre-wrap text-sm text-text-secondary">{request.description}</p> : null}

          {request.photos.length ? (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Photos</p>
              <PhotoStrip photos={request.photos} />
            </div>
          ) : null}
          {request.afterPhotos.length ? (
            <div>
              <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">After the work</p>
              <PhotoStrip photos={request.afterPhotos} />
            </div>
          ) : null}

          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Status</p>
            <Timeline items={request.timeline} map={REQUEST_STATUS_MAP} />
          </div>

          <div>
            <p className="mb-3 text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Your updates</p>
            {request.comments.length ? (
              <div className="space-y-2">
                {request.comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border bg-surface-subtle px-3 py-2">
                    <p className="whitespace-pre-wrap text-sm text-foreground">{c.body}</p>
                    <p className="mt-1 text-[11px] text-text-tertiary">{fmtDateTime(c.at)}</p>
                  </div>
                ))}
              </div>
            ) : null}
            {request.open ? (
              <div className="mt-3 space-y-2">
                <Textarea rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add details or answer a question from the office…" />
                <PhotoStrip photos={photos} onRemove={(i) => setPhotos(photos.filter((_, x) => x !== i))} />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <UploadButton purpose="request" multiple accept="image/*" onUploaded={(f) => setPhotos([...photos, ...f])} />
                  <Button onClick={sendComment} disabled={busy === "comment" || (!comment.trim() && !photos.length)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                    {busy === "comment" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MessageSquarePlus className="h-4 w-4" />} Send Update
                  </Button>
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-text-secondary">This request is closed. Need more help? Submit a new request.</p>
            )}
          </div>

          {["Submitted", "In review", "Open"].includes(request.status) ? (
            <Button
              variant="ghost"
              onClick={() => act("cancel", {}, "Request canceled.")}
              disabled={busy === "cancel"}
              className="w-full text-red-600 hover:bg-red-500/10 hover:text-red-600 dark:text-red-400"
            >
              {busy === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Cancel This Request
            </Button>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function ResidentRequests() {
  const state = usePortalData("/api/portal/resident/requests");
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState("open");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState(null);

  const requests = useMemo(() => rows ?? state.data?.requests ?? [], [rows, state.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requests.filter(
      (r) =>
        (filter === "all" || (filter === "open" ? r.open : !r.open)) &&
        (!q || `${r.name} ${r.category} ${r.area}`.toLowerCase().includes(q)),
    );
  }, [requests, filter, search]);
  const allowed = state.data?.permissions?.requests !== false;
  const upsert = (r) => setRows([r, ...requests.filter((x) => x.id !== r.id)]);

  return (
    <MainScreenWrapper>
      <ScreenHeader
        title="Maintenance"
        description="Submit requests, add photos, and follow each one from report to repair."
        actions={
          allowed ? (
            <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" /> New Request
            </Button>
          ) : null
        }
      />
      <DataGate state={state}>
        {() => (
          <>
            {!allowed ? <Notice>Online maintenance requests are turned off for your account — call the office to report a problem.</Notice> : null}
            <Toolbar>
              <Segmented value={filter} onChange={setFilter} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }]} />
              <SearchInput value={search} onChange={setSearch} placeholder="Search requests…" className="w-full sm:w-64" />
            </Toolbar>
            {!requests.length ? (
              <PortalEmpty
                icon={Wrench}
                title="No maintenance requests"
                description="When something needs fixing, submit a request and track it here."
                action={allowed ? <Button onClick={() => setCreating(true)} className="bg-primary text-primary-foreground hover:bg-primary/90"><Plus className="h-4 w-4" /> New Request</Button> : null}
              />
            ) : !filtered.length ? (
              <PortalEmpty
                icon={Wrench}
                title="No requests match"
                description="Try another filter or search."
                action={<Button variant="outline" className="border-border bg-surface-card hover:bg-surface-hover" onClick={() => { setFilter("all"); setSearch(""); }}>Clear Filters</Button>}
              />
            ) : (
              <Panel flush>
                <Rows>
                  {filtered.map((r) => (
                    <Row
                      key={r.id}
                      onClick={() => setOpenId(r.id)}
                      title={r.name}
                      meta={[fmtDate(r.createdAt), r.category, r.area, r.scheduledDate ? `Scheduled ${fmtDate(r.scheduledDate)}` : null].filter(Boolean).join(" · ")}
                      aside={<StatusPill status={r.status} map={REQUEST_STATUS_MAP} />}
                    />
                  ))}
                </Rows>
              </Panel>
            )}
          </>
        )}
      </DataGate>
      <NewRequestDialog open={creating} onOpenChange={setCreating} onCreated={upsert} />
      <RequestSheet key={openId || "none"} request={requests.find((r) => r.id === openId) || null} onClose={() => setOpenId(null)} onUpdated={upsert} />
    </MainScreenWrapper>
  );
}

export default ResidentRequests;
