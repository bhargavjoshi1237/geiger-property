"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Copy, FileSignature, Loader2, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { esignLayer } from "@/lib/supabase/esign";
import { ESIGN_STATUS_MAP, currency, filterOptions, formatDate } from "./shared";

// Custom editor sections for the Leases screen: the assembled agreement preview
// and the e-signature requests tracked against this lease.

const list = (v) => (Array.isArray(v) ? v : []);

// Assemble the full lease text from the lease's fields, charges, and clauses.
export function assembleLeaseText(lease) {
  const m = lease.metadata || {};
  const landlord = m.landlord || "the Landlord";
  const tenant = lease.tenantName || "[Tenant]";
  const lines = [`RESIDENTIAL LEASE AGREEMENT`, lease.name || "", ""];
  let n = 0;
  const section = (title, ...body) => {
    n += 1;
    lines.push(`${n}. ${title.toUpperCase()}`, ...body.filter(Boolean), "");
  };

  section(
    "Parties",
    `This Lease Agreement is made between ${landlord} ("Landlord") and ${tenant} ("Tenant").`,
    m.guarantor ? `Guarantor: ${m.guarantor}.` : "",
    m.coSigner ? `Co-signer: ${m.coSigner}.` : "",
  );
  section(
    "Premises",
    `Landlord leases to Tenant the premises known as ${lease.unit || "[Unit]"}${m.address ? `, located at ${m.address}` : ""}.`,
  );
  section(
    "Term",
    `The term begins on ${lease.termStart ? formatDate(lease.termStart) : "[start date]"} and ends on ${lease.termEnd ? formatDate(lease.termEnd) : "[end date]"}.`,
  );
  section(
    "Rent",
    `Tenant shall pay ${Number(lease.rent) > 0 ? currency(lease.rent) : "[rent]"} per month, due on the first day of each month.`,
  );
  section(
    "Security deposit",
    `Tenant shall pay a security deposit of ${currency(lease.deposit)}, held for the term and returned less lawful deductions.`,
  );
  const charges = list(m.charges);
  if (charges.length) {
    section(
      "Additional charges",
      ...charges.map((c) => `• ${c.label}${c.amount ? ` — ${currency(c.amount)}` : ""}`),
    );
  }
  if (m.renewalOption) {
    section(
      "Renewal",
      `Renewal: ${m.renewalOption}.${m.noticeDays ? ` Either party must give ${m.noticeDays} days' notice.` : ""}`,
    );
  }
  const clauses = list(m.clauses);
  if (clauses.length) {
    n += 1;
    lines.push(`${n}. ADDITIONAL TERMS`);
    clauses.forEach((c, i) => {
      lines.push(`${n}.${i + 1} ${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    });
    lines.push("");
  }
  lines.push(
    "SIGNATURES",
    "",
    `Landlord: ______________________   Date: __________`,
    `Tenant (${tenant}): ______________________   Date: __________`,
  );
  if (m.guarantor) lines.push(`Guarantor (${m.guarantor}): ______________________   Date: __________`);
  return lines.join("\n");
}

// Read-only preview of the assembled agreement with a copy action.
export function LeasePreviewSection({ item }) {
  const text = useMemo(() => assembleLeaseText(item), [item]);
  const missing = [
    !item.tenantName && "tenant",
    !item.unit && "unit",
    !item.termStart && "term start",
    !item.termEnd && "term end",
    !(Number(item.rent) > 0) && "rent",
  ].filter(Boolean);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Lease text copied.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  return (
    <div className="space-y-4">
      {missing.length ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Still missing: {missing.join(", ")}. Placeholders are shown in brackets.</span>
        </div>
      ) : null}
      <SectionCard
        title="Assembled agreement"
        description="Built from this lease's parties, unit, terms, charges, and clauses."
        action={
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="h-4 w-4" /> Copy text
          </Button>
        }
      >
        <pre className="max-h-[560px] overflow-auto whitespace-pre-wrap font-mono text-[13px] leading-relaxed text-foreground">
          {text}
        </pre>
      </SectionCard>
    </div>
  );
}

const ESIGN_OPTIONS = filterOptions(ESIGN_STATUS_MAP).slice(1);

// Signing requests linked to this lease (tracked here; nothing is sent).
export function LeaseEsignSection({ item }) {
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    esignLayer.list({ leaseId: item.id }).then((r) => alive && setRows(r ?? []));
    return () => {
      alive = false;
    };
  }, [item.id]);

  const create = async () => {
    setBusy(true);
    const row = {
      id: crypto.randomUUID(),
      name: item.name || "Lease",
      signer: item.tenantName || "",
      leaseId: item.id,
      status: "Draft",
    };
    setRows((prev) => [row, ...(prev || [])]);
    const created = await esignLayer.create(row);
    setBusy(false);
    if (created) {
      setRows((prev) => prev.map((x) => (x.id === row.id ? created : x)));
      toast.success("Signing request created.");
    } else {
      setRows((prev) => prev.filter((x) => x.id !== row.id));
      toast.error("Couldn't create the signing request.");
    }
  };

  const setStatus = async (row, status) => {
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, status } : x)));
    const saved = await esignLayer.update(row.id, { status });
    if (!saved) {
      setRows((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      toast.error("Couldn't update the request.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-text-secondary">
          Signing is tracked here — requests aren&apos;t sent to signers yet. Update each
          status as signatures come back.
        </p>
        <Button
          className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={create}
          disabled={busy}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Create signing request
        </Button>
      </div>

      {rows === null ? (
        <ListLoading label="Loading signing requests" className="py-10" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState
            icon={FileSignature}
            title="No signing requests yet"
            description="Create one to track signatures for this lease."
          />
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-surface-subtle">
          {rows.map((r) => {
            const signers = list(r.metadata?.signers);
            const signed = signers.filter((s) => s.done).length;
            return (
              <li key={r.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-medium text-foreground">{r.name}</p>
                    <StatusPill status={r.status} map={ESIGN_STATUS_MAP} />
                  </div>
                  <p className="truncate text-xs text-text-secondary">
                    {[
                      r.signer || "No signer set",
                      signers.length ? `${signed}/${signers.length} signed` : null,
                      r.createdAt ? `Created ${formatDate(r.createdAt)}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Select value={r.status} onValueChange={(v) => setStatus(r, v)}>
                  <SelectTrigger className="w-full bg-surface-card sm:w-40" aria-label="Request status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ESIGN_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
