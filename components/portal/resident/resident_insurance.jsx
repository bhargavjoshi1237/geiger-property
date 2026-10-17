"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, ShieldAlert, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, ScreenHeader, StatusPill } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { COMPLIANCE_STATUS_MAP } from "@/lib/portal/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { SwitchRow } from "../form_bits";
import { AttachmentField, DataGate, Notice, Panel, PortalEmpty, Row, Rows, fmtDate, money, todayISO, usePortalData } from "../portal_kit";

const EMPTY = { carrier: "", policyNumber: "", startsOn: "", endsOn: "", liability: "", personalProperty: "", interestedPartyListed: true, insuredNames: "", document: null };

function PolicyDialog({ open, onOpenChange, onSaved }) {
  const [draft, setDraft] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));

  const save = async (e) => {
    e.preventDefault();
    if (!draft.carrier.trim() || !draft.endsOn) return toast.error("Add the carrier and the expiry date.");
    if (!draft.document) return toast.error("Attach your declarations page or certificate.");
    setBusy(true);
    const res = await portalApi("/api/portal/resident/insurance", { method: "POST", body: draft });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Policy uploaded. The office will verify it shortly.");
    setDraft(EMPTY);
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload renters insurance</DialogTitle>
          <DialogDescription>Add your policy details and attach the declarations page.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Insurance company" htmlFor="ins-carrier">
              <Input id="ins-carrier" value={draft.carrier} onChange={(e) => set("carrier")(e.target.value)} placeholder="e.g. Lemonade" />
            </Field>
            <Field label="Policy number" htmlFor="ins-number">
              <Input id="ins-number" value={draft.policyNumber} onChange={(e) => set("policyNumber")(e.target.value)} />
            </Field>
            <Field label="Effective" htmlFor="ins-start">
              <Input id="ins-start" type="date" value={draft.startsOn} onChange={(e) => set("startsOn")(e.target.value)} />
            </Field>
            <Field label="Expires" htmlFor="ins-end">
              <Input id="ins-end" type="date" min={todayISO()} value={draft.endsOn} onChange={(e) => set("endsOn")(e.target.value)} />
            </Field>
            <Field label="Liability coverage" htmlFor="ins-liab">
              <Input id="ins-liab" inputMode="decimal" value={draft.liability} onChange={(e) => set("liability")(e.target.value.replace(/[^\d.]/g, ""))} placeholder="100000" />
            </Field>
            <Field label="Personal property" htmlFor="ins-pp">
              <Input id="ins-pp" inputMode="decimal" value={draft.personalProperty} onChange={(e) => set("personalProperty")(e.target.value.replace(/[^\d.]/g, ""))} />
            </Field>
          </div>
          <Field label="Named insureds" htmlFor="ins-names">
            <Input id="ins-names" value={draft.insuredNames} onChange={(e) => set("insuredNames")(e.target.value)} placeholder="Everyone on the policy" />
          </Field>
          <SwitchRow label="Property manager listed as interested party" checked={draft.interestedPartyListed} onChange={set("interestedPartyListed")} />
          <Field label="Declarations page">
            <AttachmentField value={draft.document} onChange={set("document")} purpose="insurance" label="Attach PDF or photo" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload Policy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ResidentInsurance() {
  const state = usePortalData("/api/portal/resident/insurance");
  const [open, setOpen] = useState(false);
  const add = (
    <Button onClick={() => setOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
      <Plus className="h-4 w-4" /> Upload Policy
    </Button>
  );

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Renters insurance" description="Keep a current policy on file. New uploads are reviewed by the office." actions={add} />
      <DataGate state={state}>
        {(data) => {
          const today = todayISO();
          const current = data.policies.find((p) => p.status !== "Cancelled" && p.endsOn >= today);
          return (
            <>
              {data.required && !current ? (
                <Notice icon={ShieldAlert} tone="warning">
                  Your lease requires renters insurance{data.minimumLiability ? ` with at least ${money(data.minimumLiability)} liability coverage` : ""}. Upload your policy to stay compliant.
                </Notice>
              ) : current ? (
                <Notice icon={ShieldCheck} tone="success">
                  {current.carrier} policy on file through {fmtDate(current.endsOn)}
                  {current.status === "Pending" ? " — awaiting verification." : "."}
                </Notice>
              ) : null}
              {data.policies.length ? (
                <Panel title="Policies on file" flush>
                  <Rows>
                    {data.policies.map((p) => (
                      <Row
                        key={p.id}
                        title={[p.carrier, p.policyNumber].filter(Boolean).join(" · ")}
                        meta={[p.startsOn ? `${fmtDate(p.startsOn)} – ${fmtDate(p.endsOn)}` : `Expires ${fmtDate(p.endsOn)}`, p.liability ? `${money(p.liability)} liability` : null].filter(Boolean).join(" · ")}
                        aside={
                          <>
                            {p.documentUrl ? (
                              <a href={p.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-text-secondary hover:text-foreground">
                                View
                              </a>
                            ) : null}
                            <StatusPill status={p.status} map={COMPLIANCE_STATUS_MAP} />
                          </>
                        }
                      />
                    ))}
                  </Rows>
                </Panel>
              ) : (
                <PortalEmpty icon={ShieldCheck} title="No policy on file" description="Upload your renters insurance declarations page to share it with the office." action={add} />
              )}
            </>
          );
        }}
      </DataGate>
      <PolicyDialog open={open} onOpenChange={setOpen} onSaved={state.reload} />
    </MainScreenWrapper>
  );
}

export default ResidentInsurance;
