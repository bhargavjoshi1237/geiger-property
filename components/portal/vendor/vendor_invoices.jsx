"use client";

import React, { useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, Receipt, Send } from "lucide-react";

import { Button } from "@geiger/ui/button";
import { Input } from "@geiger/ui/input";
import { Textarea } from "@geiger/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { Field, ScreenHeader, SearchInput, StatsBar, StatusPill, Toolbar } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { BILL_APPROVAL_MAP, BILL_STATUS_MAP } from "@/lib/portal/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { Segmented, SelectField } from "../form_bits";
import { AttachmentField, DataGate, Notice, Panel, PortalEmpty, Row, Rows, fmtDate, money, money0, todayISO, usePortalData } from "../portal_kit";

const emptyDraft = (workOrderId = "") => ({
  workOrderId,
  invoiceNumber: "",
  amount: "",
  invoiceDate: todayISO(),
  dueDate: "",
  description: "",
  attachment: null,
});

// Submit an invoice (optionally against one of the vendor's work orders).
export function InvoiceDialog({ open, onOpenChange, workOrders = [], workOrderId = "", onSubmitted }) {
  const [draft, setDraft] = useState(() => emptyDraft(workOrderId));
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const submit = async (e) => {
    e.preventDefault();
    if (!(Number(draft.amount) > 0)) return toast.error("Enter the invoice amount.");
    if (!draft.attachment) return toast.error("Attach the invoice PDF or photo.");
    setBusy(true);
    const res = await portalApi("/api/portal/vendor/invoices", { method: "POST", body: { ...draft, amount: Number(draft.amount) } });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Invoice submitted for approval.");
    setDraft(emptyDraft());
    onOpenChange(false);
    onSubmitted?.(res.invoice);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Submit an invoice</DialogTitle>
          <DialogDescription>It goes to the office for approval, then into payables.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Work order" htmlFor="inv-wo">
            <SelectField
              id="inv-wo"
              value={draft.workOrderId}
              onChange={set("workOrderId")}
              placeholder="Not tied to a work order"
              options={workOrders.map((w) => ({ value: w.id, label: `${w.name}${w.property?.name ? ` · ${w.property.name}` : ""}` }))}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Invoice number" htmlFor="inv-num">
              <Input id="inv-num" value={draft.invoiceNumber} onChange={(e) => set("invoiceNumber")(e.target.value)} />
            </Field>
            <Field label="Amount" htmlFor="inv-amt">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-tertiary">$</span>
                <Input id="inv-amt" inputMode="decimal" className="pl-6 tabular-nums" value={draft.amount} onChange={(e) => set("amount")(e.target.value.replace(/[^\d.]/g, ""))} />
              </div>
            </Field>
            <Field label="Invoice date" htmlFor="inv-date">
              <Input id="inv-date" type="date" value={draft.invoiceDate} onChange={(e) => set("invoiceDate")(e.target.value)} />
            </Field>
            <Field label="Due date" htmlFor="inv-due" hint="Blank uses your payment terms.">
              <Input id="inv-due" type="date" value={draft.dueDate} onChange={(e) => set("dueDate")(e.target.value)} />
            </Field>
          </div>
          <Field label="Description" htmlFor="inv-desc">
            <Textarea id="inv-desc" rows={3} value={draft.description} onChange={(e) => set("description")(e.target.value)} placeholder="Labor, parts, trip charge…" />
          </Field>
          <Field label="Invoice file">
            <AttachmentField value={draft.attachment} onChange={set("attachment")} purpose="invoice" label="Attach invoice" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit Invoice
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VendorInvoices() {
  const state = usePortalData("/api/portal/vendor/invoices");
  const jobs = usePortalData("/api/portal/vendor/work-orders");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const invoices = useMemo(() => state.data?.invoices || [], [state.data]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invoices.filter((i) => {
      if (filter === "unpaid" && i.status === "Paid") return false;
      if (filter === "paid" && i.status !== "Paid") return false;
      return !q || `${i.name} ${i.invoiceNumber} ${i.propertyName}`.toLowerCase().includes(q);
    });
  }, [invoices, filter, search]);
  const allowed = state.data?.permissions?.invoices !== false;
  const add = allowed ? (
    <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
      <Plus className="h-4 w-4" /> Submit Invoice
    </Button>
  ) : null;

  const stats = useMemo(() => {
    const unpaid = invoices.filter((i) => i.status !== "Paid" && i.status !== "Void");
    return [
      { label: "Submitted", value: String(invoices.length), footer: "All time" },
      { label: "In review", value: String(invoices.filter((i) => i.approvalStatus === "Pending").length), footer: "Awaiting approval" },
      { label: "Outstanding", value: money0(unpaid.reduce((s, i) => s + i.amount - i.amountPaid, 0)), footer: `${unpaid.length} unpaid` },
      { label: "Paid", value: money0(invoices.reduce((s, i) => s + i.amountPaid, 0)), footer: "Received to date" },
    ];
  }, [invoices]);

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Invoices" description="Bill the office for completed work and track approval and payment." actions={add} />
      <DataGate state={state}>
        {() => (
          <>
            {!allowed ? <Notice>Invoice upload is turned off for your account — email invoices to the office.</Notice> : null}
            <StatsBar stats={stats} />
            <Toolbar>
              <Segmented value={filter} onChange={setFilter} options={[{ value: "all", label: "All" }, { value: "unpaid", label: "Unpaid" }, { value: "paid", label: "Paid" }]} />
              <SearchInput value={search} onChange={setSearch} placeholder="Search invoices…" className="w-full sm:w-64" />
            </Toolbar>
            {!invoices.length ? (
              <PortalEmpty icon={Receipt} title="No invoices yet" description="Submit an invoice when you finish a job." action={add} />
            ) : !filtered.length ? (
              <PortalEmpty icon={Receipt} title="No invoices match" description="Try another filter or search." />
            ) : (
              <Panel flush>
                <Rows>
                  {filtered.map((i) => (
                    <Row
                      key={i.id}
                      title={i.name}
                      meta={[fmtDate(i.billDate), i.dueDate ? `Due ${fmtDate(i.dueDate)}` : null, i.propertyName].filter(Boolean).join(" · ")}
                      aside={
                        <>
                          {i.status === "Open" ? <StatusPill status={i.approvalStatus} map={BILL_APPROVAL_MAP} /> : <StatusPill status={i.status} map={BILL_STATUS_MAP} />}
                          <span className="hidden w-24 text-right text-sm tabular-nums text-foreground sm:inline">{money(i.amount)}</span>
                        </>
                      }
                    />
                  ))}
                </Rows>
              </Panel>
            )}
          </>
        )}
      </DataGate>
      <InvoiceDialog key={open ? "open" : "closed"} open={open} onOpenChange={setOpen} workOrders={jobs.data?.workOrders || []} onSubmitted={state.reload} />
    </MainScreenWrapper>
  );
}

export default VendorInvoices;
