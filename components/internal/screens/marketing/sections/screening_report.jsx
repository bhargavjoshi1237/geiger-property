"use client";

import { ShieldAlert } from "lucide-react";
import { LogoLoading } from "@geiger/ui";

import { Button } from "@geiger/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@geiger/ui/dialog";
import { StatusPill } from "@/components/internal/shared/screen_kit";
import { screeningReportApi } from "@/lib/screening/api";
import { Note, useLoad } from "./common";
import { PARTY_ROLE_OPTIONS, SCREENING_STATUS_MAP, formatDate } from "../shared";

// "View report" (RISK-03): the recorded screening report, read through /api/screening, which needs property.screening.view_reports.

const roleLabel = (v) => PARTY_ROLE_OPTIONS.find((o) => o.value === v)?.label || v;

function Facts({ items }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">{it.label}</dt>
          <dd className="mt-1 truncate text-sm text-foreground">{it.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

// One check or party: name and status, a summary line, then the recorded findings.
function Finding({ title, status, meta, findings }) {
  return (
    <li className="space-y-1.5 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <StatusPill status={status} map={SCREENING_STATUS_MAP} />
      </div>
      {meta ? <p className="text-xs text-text-secondary">{meta}</p> : null}
      <p className="whitespace-pre-wrap text-sm text-text-secondary">{findings || "No findings recorded."}</p>
    </li>
  );
}

// Mounted only while the dialog is open, so every open reads the report afresh.
function ReportBody({ applicationId }) {
  const res = useLoad(() => screeningReportApi(applicationId), [applicationId]);
  if (res === undefined) {
    return (
      <div className="flex justify-center py-10">
        <LogoLoading size={40} aria-label="Loading the screening report" />
      </div>
    );
  }
  if (!res?.ok) {
    return (
      <Note icon={ShieldAlert}>
        {res?.status === 403 ? "Your role can't open screening reports." : res?.error || "Couldn't load the screening report."}
      </Note>
    );
  }
  const r = res.report;
  return (
    <div className="grid gap-5">
      <Facts
        items={[
          { label: "Screening company", value: r.vendor },
          { label: "Report reference", value: r.reference },
          { label: "Consent on file", value: r.consent ? `Yes${r.consentOn ? ` · ${formatDate(r.consentOn)}` : ""}` : "No" },
          { label: "Requested", value: r.requestedAt ? formatDate(r.requestedAt) : "" },
        ]}
      />
      <ul className="divide-y divide-border rounded-lg border border-border">
        {r.checks.map((c) => (
          <Finding
            key={c.key}
            title={c.label}
            status={c.status}
            meta={[c.result, c.score !== null ? `Score ${c.score}` : null, c.completedOn ? `Completed ${formatDate(c.completedOn)}` : null]
              .filter(Boolean)
              .join(" · ")}
            findings={c.findings}
          />
        ))}
      </ul>
      {r.coApplicants.length ? (
        <div className="grid gap-2">
          <p className="text-[11px] font-medium uppercase tracking-wider text-text-tertiary">Co-applicants</p>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {r.coApplicants.map((p) => (
              <Finding key={p.id} title={p.name || "Co-applicant"} status={p.status} meta={roleLabel(p.role)} findings={p.findings} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function ScreeningReportDialog({ applicationId, applicant, open, onOpenChange }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Screening report</DialogTitle>
          <DialogDescription>
            {applicant ? `${applicant} — ` : ""}recorded results and findings. Treat this as a consumer report: don&apos;t copy it into notes, emails or exports.
          </DialogDescription>
        </DialogHeader>
        {open ? <ReportBody applicationId={applicationId} /> : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
