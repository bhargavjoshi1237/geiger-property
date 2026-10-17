"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { BadgeCheck, Loader2, Plus, ShieldAlert, ShieldCheck, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, ScreenHeader, StatusPill } from "@/components/internal/shared/screen_kit";
import { MainScreenWrapper } from "@/components/internal/shared/screen_wrappers";
import { COMPLIANCE_STATUS_MAP } from "@/lib/portal/constants";
import { portalApi } from "@/lib/portal/portal_fetch";
import { SelectField, SwitchRow } from "../form_bits";
import { AttachmentField, DataGate, Notice, Panel, PortalEmpty, Row, Rows, fmtDate, money, todayISO, usePortalData } from "../portal_kit";

const COVERAGE = ["General liability", "Workers' compensation", "Commercial auto", "Umbrella", "Professional liability"];
const US_STATES = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");

const emptyDraft = (kind) => ({
  kind,
  name: "",
  policyType: "General liability",
  policyNumber: "",
  number: "",
  state: "",
  startsOn: "",
  endsOn: "",
  amount: "",
  additionalInsured: true,
  document: null,
});

function UploadDialog({ kind, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => emptyDraft(kind));
  const [busy, setBusy] = useState(false);
  const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }));
  const coi = kind === "insurance_policy";

  const save = async (e) => {
    e.preventDefault();
    if (!draft.name.trim() || !draft.endsOn) return toast.error(coi ? "Add the carrier and expiry date." : "Add the license type and expiry date.");
    if (!draft.document) return toast.error("Attach the document.");
    setBusy(true);
    const res = await portalApi("/api/portal/vendor/compliance", { method: "POST", body: draft });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Uploaded. The office will verify it shortly.");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{coi ? "Upload insurance certificate" : "Upload license"}</DialogTitle>
          <DialogDescription>{coi ? "Certificate of insurance (COI) naming the property manager." : "Trade or business license."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={coi ? "Insurance carrier" : "License type"} htmlFor="cp-name">
              <Input id="cp-name" value={draft.name} onChange={(e) => set("name")(e.target.value)} placeholder={coi ? "e.g. Travelers" : "e.g. Master plumber"} />
            </Field>
            {coi ? (
              <Field label="Coverage" htmlFor="cp-type">
                <SelectField id="cp-type" value={draft.policyType} onChange={set("policyType")} options={COVERAGE} />
              </Field>
            ) : (
              <Field label="License number" htmlFor="cp-num">
                <Input id="cp-num" value={draft.number} onChange={(e) => set("number")(e.target.value)} />
              </Field>
            )}
            {coi ? (
              <Field label="Policy number" htmlFor="cp-pol">
                <Input id="cp-pol" value={draft.policyNumber} onChange={(e) => set("policyNumber")(e.target.value)} />
              </Field>
            ) : (
              <Field label="State" htmlFor="cp-state">
                <SelectField id="cp-state" value={draft.state} onChange={set("state")} options={US_STATES} />
              </Field>
            )}
            {coi ? (
              <Field label="Per occurrence" htmlFor="cp-amt">
                <Input id="cp-amt" inputMode="decimal" value={draft.amount} onChange={(e) => set("amount")(e.target.value.replace(/[^\d.]/g, ""))} placeholder="1000000" />
              </Field>
            ) : null}
            <Field label={coi ? "Effective" : "Issued"} htmlFor="cp-start">
              <Input id="cp-start" type="date" value={draft.startsOn} onChange={(e) => set("startsOn")(e.target.value)} />
            </Field>
            <Field label="Expires" htmlFor="cp-end">
              <Input id="cp-end" type="date" min={todayISO()} value={draft.endsOn} onChange={(e) => set("endsOn")(e.target.value)} />
            </Field>
          </div>
          {coi ? <SwitchRow label="Property manager named as additional insured" checked={draft.additionalInsured} onChange={set("additionalInsured")} /> : null}
          <Field label="Document">
            <AttachmentField value={draft.document} onChange={set("document")} purpose="compliance" label="Attach PDF or photo" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ItemRows({ items }) {
  return (
    <Rows>
      {items.map((i) => (
        <Row
          key={i.id}
          title={[i.name, i.kind === "license" ? i.number && `#${i.number}` : i.policyType].filter(Boolean).join(" · ")}
          meta={[
            i.startsOn ? `${fmtDate(i.startsOn)} – ${fmtDate(i.endsOn)}` : `Expires ${fmtDate(i.endsOn)}`,
            i.kind === "license" ? i.state : i.amount ? `${money(i.amount)} per occurrence` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          aside={
            <>
              {i.documentUrl ? (
                <a href={i.documentUrl} target="_blank" rel="noreferrer" className="text-xs text-text-secondary hover:text-foreground">
                  View
                </a>
              ) : null}
              <StatusPill status={i.status} map={COMPLIANCE_STATUS_MAP} />
            </>
          }
        />
      ))}
    </Rows>
  );
}

export function VendorCompliance() {
  const state = usePortalData("/api/portal/vendor/compliance");
  const [uploading, setUploading] = useState(null);
  const allowed = state.data?.permissions?.compliance !== false;
  const actions = allowed ? (
    <>
      <Button variant="outline" onClick={() => setUploading("license")} className="border-border bg-surface-card hover:bg-surface-hover">
        <BadgeCheck className="h-4 w-4" /> Add License
      </Button>
      <Button onClick={() => setUploading("insurance_policy")} className="bg-primary text-primary-foreground hover:bg-primary/90">
        <Plus className="h-4 w-4" /> Add Certificate
      </Button>
    </>
  ) : null;

  return (
    <MainScreenWrapper>
      <ScreenHeader title="Insurance & licenses" description="Keep your certificates and licenses current so work and payments aren't held up." actions={actions} />
      <DataGate state={state}>
        {(data) => {
          const today = todayISO();
          const cois = data.items.filter((i) => i.kind === "insurance_policy");
          const licenses = data.items.filter((i) => i.kind === "license");
          const liveCoi = cois.some((i) => i.status === "Active" && i.endsOn >= today);
          const soon = data.items.filter((i) => i.status !== "Expired" && i.endsOn && i.endsOn >= today && (new Date(i.endsOn) - new Date(today)) / 86400000 <= 30);
          return (
            <>
              {!allowed ? <Notice>Document upload is turned off for your account — email certificates to the office.</Notice> : null}
              {!liveCoi ? (
                <Notice icon={ShieldAlert} tone="warning">
                  We don&apos;t have a verified, current certificate of insurance for you. Upload one to keep receiving work.
                </Notice>
              ) : soon.length ? (
                <Notice icon={ShieldAlert} tone="warning">
                  {soon.length} document{soon.length === 1 ? " expires" : "s expire"} within 30 days — upload renewals when you have them.
                </Notice>
              ) : null}

              <Panel title="Certificates of insurance" flush>
                {cois.length ? <ItemRows items={cois} /> : <PortalEmpty icon={ShieldCheck} title="No certificates on file" description="Upload your COI to get started." className="border-0" />}
              </Panel>
              <Panel title="Licenses" flush>
                {licenses.length ? <ItemRows items={licenses} /> : <PortalEmpty icon={BadgeCheck} title="No licenses on file" description="Add trade or business licenses for your work." className="border-0" />}
              </Panel>
            </>
          );
        }}
      </DataGate>
      {uploading ? (
        <UploadDialog
          kind={uploading}
          onClose={() => setUploading(null)}
          onSaved={() => {
            setUploading(null);
            state.reload();
          }}
        />
      ) : null}
    </MainScreenWrapper>
  );
}

export default VendorCompliance;
