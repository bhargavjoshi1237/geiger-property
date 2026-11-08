"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Copy, Download, FilePlus2, FileSignature, FileText, ListChecks, Loader2, Plus, RefreshCw, Wand2 } from "lucide-react";

import { Badge } from "@geiger/ui/badge";
import { Button } from "@geiger/ui/button";
import { Checkbox } from "@geiger/ui/checkbox";
import { Input } from "@geiger/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@geiger/ui/select";
import { EmptyState, ListLoading, SectionCard, StatusPill } from "@/components/internal/shared/screen_kit";
import { FieldsForm } from "@/components/internal/screens/entity/fields_form";
import { ChildRecords } from "@/components/internal/screens/entity/sections/child_records";
import { esignLayer } from "@/lib/supabase/esign";
import { leaseAddendaLayer } from "@/lib/supabase/lease_addenda";
import { leaseTemplatesLayer } from "@/lib/supabase/lease_templates";
import { listDocuments } from "@/lib/supabase/documents";
import { signedDownloadUrl, useSignedUrls } from "@/lib/supabase/file_urls";
import { fileRef, isPdf } from "@/lib/files/refs";
import { listLeaseParties } from "@/lib/supabase/lease_parties";
import { generateLeaseDocument, mergeLeaseDocument, todayISO } from "@/lib/leasing/workflows";
import { MERGE_FIELDS, MERGE_GROUPS } from "@/lib/leasing/merge";
import { customFieldList, isAddendumIncluded, orderAddenda } from "@/lib/leasing/documents/compose_rules";
import { layerAdapter } from "../adapters";
import { Callout, MetaRecords } from "./gated";
import { MergedText } from "./merged_text";
import { ADDENDA_STATUS_MAP, ESIGN_STATUS_MAP, filterOptions, formatDate, metaList, toOptions } from "../shared";

// Agreement tabs of the lease editor: template + document generation, merged
// preview, clauses, addenda, and e-signature tracking (no provider connected).

export async function leaseTemplateOptions() {
  const rows = (await leaseTemplatesLayer.list()) ?? [];
  return rows
    .filter((t) => t.status !== "Archived")
    .map((t) => ({
      value: t.id,
      label: [t.name || "Template", t.state, t.status === "Draft" ? "draft" : null].filter(Boolean).join(" · "),
      patch: {},
    }));
}

const TEMPLATE_FIELDS = [
  { key: "templateId", label: "Lease template", type: "relation", load: leaseTemplateOptions, full: true, hint: "Without a template the built-in starter agreement is used." },
  { key: "documentLanguage", label: "Document language", type: "select", meta: true, options: toOptions(["English", "Spanish", "French", "Chinese", "Vietnamese"]) },
  { key: "governingState", label: "Governing state", type: "text", meta: true, placeholder: "e.g. TX" },
];

// --- Template & generated documents ------------------------------------------------

// Generated lease files: LEAS-08 PDFs (older .txt agreements still list), signed copies (LEAS-09) and amendments (LEAS-16).
const LEASE_DOC_KINDS = { lease_agreement: null, lease_agreement_signed: "Signed", lease_amendment: "Amendment" };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const docFacts = (d) =>
  [
    d.pages ? plural(d.pages, "page", "pages") : null,
    d.templateId ? `${d.templateName || "Template"}${d.templateVersion ? ` v${d.templateVersion}` : ""}` : d.format === "pdf" ? "Starter agreement" : null,
    Array.isArray(d.addendaIds) && d.addendaIds.length ? plural(d.addendaIds.length, "addendum", "addenda") : null,
    d.generatedBy?.name || null,
    formatDate(d.createdAt),
  ]
    .filter(Boolean)
    .join(" · ");

// This lease's values for the template's custom fields; a blank one uses the template's default.
function TemplateFieldsCard({ fields, item, onCommitMeta }) {
  const saved = item.metadata?.templateFieldValues || {};
  const [draft, setDraft] = useState(saved);
  const commit = async (key) => {
    const value = String(draft[key] ?? "").trim();
    if (value === String(saved[key] ?? "")) return;
    if (await onCommitMeta({ templateFieldValues: { ...saved, [key]: value } })) toast.success(`Saved {{${key}}} for this lease.`);
  };
  return (
    <SectionCard title="Template fields" description="Custom placeholders from the template. Leave one blank to use the template's default." bodyPadding={false}>
      <ul className="divide-y divide-border">
        {fields.map((f) => (
          <li key={f.key} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
            <span className="font-mono text-xs text-text-secondary">{`{{${f.key}}}`}</span>
            <Input
              value={draft[f.key] ?? ""}
              placeholder={f.value || "No default"}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onBlur={() => commit(f.key)}
              onKeyDown={(e) => e.key === "Enter" && commit(f.key)}
              className="h-8 bg-surface-card sm:max-w-xs"
              aria-label={`Value for ${f.key}`}
            />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

export function LeaseDocumentSection({ item, onPatch, onCommit, onCommitMeta, onNavigate }) {
  const [docs, setDocs] = useState(null);
  const [merged, setMerged] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gaps, setGaps] = useState(null);
  const urlOf = useSignedUrls(docs);

  useEffect(() => {
    let alive = true;
    Promise.all([listDocuments("lease", item.id), mergeLeaseDocument(item)]).then(([d, m]) => {
      if (!alive) return;
      setDocs((d ?? []).filter((x) => x.kind in LEASE_DOC_KINDS));
      setMerged(m || { values: {}, template: null, addenda: [] });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.templateId]);

  const values = merged?.values || null;
  const templateFields = useMemo(() => customFieldList(merged?.template), [merged]);
  const included = merged?.addenda?.length || 0;

  const generate = async () => {
    setBusy(true);
    const res = await generateLeaseDocument(item);
    setBusy(false);
    if (!res?.ok) {
      toast.error(res?.error || "Couldn't generate the lease document.");
      return;
    }
    setDocs((prev) => [res.document, ...(prev || [])]);
    setGaps({ unknown: res.unknown || [], empty: res.empty || [], warnings: res.warnings || [] });
    // The server already saved these keys; mirror them into the open editor.
    await onCommitMeta({
      lastDocumentAt: res.document.generatedAt || new Date().toISOString(),
      lastDocumentId: res.document.id,
      lastDocumentUrl: "",
      lastDocumentFile: { bucket: res.document.bucket, path: res.document.storagePath },
      lastDocumentTemplate: { id: res.document.templateId || null, version: res.document.templateVersion ?? null, hash: res.document.templateHash || "" },
    });
    toast.success(`Lease PDF generated (${plural(res.pages, "page", "pages")}) and saved to Documents.`);
  };

  const download = async (d) => {
    const url = await signedDownloadUrl(fileRef(d), d.name);
    if (url) window.location.assign(url);
    else toast.error("Couldn't download this file yet. Try again in a moment.");
  };

  return (
    <div className="space-y-6">
      <SectionCard title="Template">
        <FieldsForm item={item} fields={TEMPLATE_FIELDS} onPatch={onPatch} onCommit={onCommit} onCommitMeta={onCommitMeta} />
      </SectionCard>

      {templateFields.length ? <TemplateFieldsCard key={item.templateId} fields={templateFields} item={item} onCommitMeta={onCommitMeta} /> : null}

      <SectionCard
        title="Lease document"
        description={`Merges the template${included ? ` and ${plural(included, "addendum", "addenda")}` : ""} with this lease's people, unit, property and policies into a PDF with a signature block per signer, saved privately to Documents.`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => onNavigate("preview")}>
              Preview
            </Button>
            <Button size="sm" className="bg-primary text-primary-foreground hover:bg-primary/90" disabled={busy} onClick={generate}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Generate Lease PDF
            </Button>
          </div>
        }
        bodyPadding={false}
      >
        {gaps && (gaps.unknown.length || gaps.empty.length || gaps.warnings.length) ? (
          <div className="space-y-2 border-b border-border p-4">
            {gaps.unknown.length || gaps.empty.length ? (
              <Callout tone="warning">
                Generated with gaps — {gaps.empty.length ? `empty: ${gaps.empty.map((k) => `{{${k}}}`).join(", ")}` : ""}
                {gaps.empty.length && gaps.unknown.length ? "; " : ""}
                {gaps.unknown.length ? `unknown: ${gaps.unknown.map((k) => `{{${k}}}`).join(", ")}` : ""}.
              </Callout>
            ) : null}
            {gaps.warnings.map((w) => (
              <Callout key={w} tone="info">
                {w}
              </Callout>
            ))}
          </div>
        ) : null}
        {docs === null ? (
          <ListLoading label="Loading documents" className="rounded-none border-0 py-10" />
        ) : docs.length === 0 ? (
          <EmptyState icon={FileText} title="No lease documents yet" description="Generate a PDF from the linked template and this lease's addenda." />
        ) : (
          <ul className="divide-y divide-border">
            {docs.map((d) => {
              const ref = fileRef(d);
              return (
                <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <a href={urlOf(d) || undefined} target="_blank" rel="noreferrer" className="flex min-w-0 items-center gap-3">
                    <FileText className="h-4 w-4 shrink-0 text-text-secondary" />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground hover:underline">{d.name}</span>
                        <Badge variant={isPdf(ref) ? "info" : "neutral"}>{isPdf(ref) ? "PDF" : "Text"}</Badge>
                        {LEASE_DOC_KINDS[d.kind] ? <Badge variant="success">{LEASE_DOC_KINDS[d.kind]}</Badge> : null}
                      </span>
                      <span className="block truncate text-xs text-text-tertiary">{docFacts(d)}</span>
                    </span>
                  </a>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-text-secondary hover:bg-surface-hover hover:text-foreground"
                    onClick={() => download(d)}
                    disabled={!ref}
                    aria-label={`Download ${d.name}`}
                    title="Download"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Merge field catalog" description="Every placeholder a template can use, with this lease's current value." bodyPadding={false}>
        {values === null ? (
          <ListLoading label="Loading merge values" className="rounded-none border-0 py-10" />
        ) : (
          <div className="divide-y divide-border">
            {MERGE_GROUPS.map((g) => (
              <div key={g} className="px-5 py-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-text-tertiary">{g}</p>
                <dl className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
                  {MERGE_FIELDS.filter((f) => f.group === g).map((f) => (
                    <div key={f.key} className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                      <dt className="shrink-0 font-mono text-xs text-text-secondary" title={f.label}>{`{{${f.key}}}`}</dt>
                      <dd className={values[f.key] ? "truncate text-right text-foreground" : "truncate text-right text-text-tertiary"}>
                        {String(values[f.key] || "—").split("\n")[0]}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

// --- Merged preview ---------------------------------------------------------------

export function LeasePreviewSection({ item, onNavigate }) {
  const [merged, setMerged] = useState(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    mergeLeaseDocument(item).then((r) => alive && setMerged(r || { parts: [], text: "", unknown: [], empty: [] }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id, item.templateId, tick]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(merged?.text || "");
      toast.success("Lease text copied.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  };

  if (!merged) return <ListLoading label="Merging the lease" className="py-10" />;

  return (
    <div className="space-y-4">
      {merged.unknown.length || merged.empty.length ? (
        <Callout
          tone="warning"
          action={
            <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => onNavigate("document")}>
              Merge Fields
            </Button>
          }
        >
          {merged.empty.length ? `${merged.empty.length} field${merged.empty.length === 1 ? " is" : "s are"} still empty` : ""}
          {merged.empty.length && merged.unknown.length ? " and " : ""}
          {merged.unknown.length ? `${merged.unknown.length} placeholder${merged.unknown.length === 1 ? " is" : "s are"} unknown` : ""} — shown in brackets.
        </Callout>
      ) : null}
      <SectionCard
        title={merged.template ? `From “${merged.template.name}”` : "Starter agreement"}
        description="Live merge of this lease's data, as the PDF prints it — refresh after editing other tabs. A closing SIGNATURES heading is replaced by a signature block per signer."
        action={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => setTick((t) => t + 1)}>
              <RefreshCw className="h-4 w-4" /> Refresh
            </Button>
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={copy}>
              <Copy className="h-4 w-4" /> Copy Text
            </Button>
          </div>
        }
      >
        <MergedText parts={merged.parts} />
      </SectionCard>
      {(merged.addenda || []).map((a) => (
        <SectionCard
          key={a.id}
          title={`Addendum ${a.number}: ${a.name}`}
          description={[a.effectiveDate ? `Effective ${formatDate(a.effectiveDate)}` : "No effective date", "starts on a new page", a.requiresSignature ? "signed by every signer" : null]
            .filter(Boolean)
            .join(" · ")}
          action={
            <Button variant="outline" size="sm" className="border-border bg-surface-card" onClick={() => onNavigate("addenda")}>
              Addenda
            </Button>
          }
        >
          {a.text.trim() ? <MergedText parts={a.parts} /> : <p className="text-sm text-text-tertiary">This addendum has no text yet.</p>}
        </SectionCard>
      ))}
    </div>
  );
}

// --- Clauses -----------------------------------------------------------------------

const CLAUSE_FIELDS = [
  { key: "label", label: "Title", type: "text", required: true, placeholder: "e.g. No smoking" },
  { key: "category", label: "Category", type: "select", options: toOptions(["General", "Pets", "Parking", "Maintenance", "Use of premises", "Utilities", "Legal", "Other"]) },
  { key: "detail", label: "Wording", type: "textarea", full: true },
  { key: "required", label: "Required by law / policy", type: "switch" },
];

export function ClausesSection({ item, config, onCommitMeta }) {
  const [library, setLibrary] = useState([]);
  const clauses = metaList(item, "clauses");

  useEffect(() => {
    let alive = true;
    if (!item.templateId) return undefined;
    leaseTemplatesLayer.get(item.templateId).then((t) => alive && setLibrary(metaList(t, "clauseLibrary")));
    return () => {
      alive = false;
    };
  }, [item.templateId]);

  const available = item.templateId ? library.filter((c) => !clauses.some((x) => x.libraryId === c.id)) : [];

  const insert = async (c) => {
    const ok = await onCommitMeta({
      clauses: [...clauses, { id: crypto.randomUUID(), libraryId: c.id, label: c.title || c.label, detail: c.body || c.detail || "", category: c.category || "", required: Boolean(c.required) }],
    });
    if (ok) toast.success(`Added “${c.title || c.label}”.`);
  };

  return (
    <div className="space-y-6">
      {available.length ? (
        <SectionCard title="Clause library" description="Clauses from the linked template — add the ones this lease needs." bodyPadding={false}>
          <ul className="divide-y divide-border">
            {available.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{c.title || c.label}</p>
                  <p className="truncate text-xs text-text-secondary">{c.body || c.detail}</p>
                </div>
                <Button size="sm" variant="outline" className="border-border bg-surface-card" onClick={() => insert(c)}>
                  <Plus className="h-4 w-4" /> Add
                </Button>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}
      <MetaRecords
        item={item}
        config={config}
        onCommitMeta={onCommitMeta}
        field="clauses"
        fields={CLAUSE_FIELDS}
        singular="Clause"
        icon={ListChecks}
        defaults={() => ({ category: "General" })}
        emptyDescription="Additional terms merged into the agreement as {{lease.clauses}}, in order."
        summary={(c) => ({
          title: c.label,
          meta: [c.category, c.detail].filter(Boolean).join(" · "),
          badge: c.required ? "Required" : null,
          badgeVariant: "warning",
        })}
      />
    </div>
  );
}

// --- Addenda -----------------------------------------------------------------------

const ADDENDUM_FIELDS = [
  { key: "name", label: "Addendum", type: "text", required: true, placeholder: "e.g. Pet agreement" },
  { key: "status", label: "Status", type: "select", options: filterOptions(ADDENDA_STATUS_MAP).slice(1) },
  { key: "effectiveDate", label: "Effective", type: "date" },
  { key: "signedOn", label: "Signed on", type: "date" },
  { key: "requiresSignature", label: "Requires signature", type: "switch" },
  { key: "body", label: "Text", type: "textarea", full: true },
];

const addendumAdapter = layerAdapter(leaseAddendaLayer, "leaseId");

// Addendum id → its place in the next lease PDF (Void ones have none).
const pdfOrder = (rows) => new Map(orderAddenda(rows).map((a, i) => [a.id, i + 1]));

export function AddendaSection({ item, config }) {
  const [order, setOrder] = useState(() => new Map());
  // Rows load in PDF order (effective date, then added), Void ones last.
  const adapter = useMemo(
    () => ({
      ...addendumAdapter,
      load: async (it) => {
        const rows = (await addendumAdapter.load(it)) ?? [];
        const sorted = [...orderAddenda(rows), ...rows.filter((a) => !isAddendumIncluded(a))];
        setOrder(pdfOrder(sorted));
        return sorted;
      },
    }),
    [],
  );
  return (
    <ChildRecords
      item={item}
      config={config}
      adapter={adapter}
      fields={ADDENDUM_FIELDS}
      singular="Addendum"
      plural="Addenda"
      icon={FilePlus2}
      defaults={() => ({ status: "Draft", requiresSignature: true, effectiveDate: item.termStart || "" })}
      emptyDescription="Attach pet, parking, lead paint, mold, and other addenda to this lease. Each one prints on its own page of the lease PDF, by effective date."
      onChange={(rows) => setOrder(pdfOrder(rows))}
      summary={(a) => {
        const n = order.get(a.id);
        return {
          title: n ? `${n}. ${a.name}` : a.name,
          meta: [
            n ? "Included in next generation" : "Left out of the PDF (Void)",
            a.metadata?.effectiveDate ? `Effective ${formatDate(a.metadata.effectiveDate)}` : "No effective date",
            a.metadata?.signedOn ? `Signed ${formatDate(a.metadata.signedOn)}` : null,
            a.body,
          ]
            .filter(Boolean)
            .join(" · "),
          badge: a.status,
          badgeVariant: ADDENDA_STATUS_MAP[a.status]?.variant || "neutral",
        };
      }}
    />
  );
}

// --- E-signature (tracking only) -------------------------------------------------

const ESIGN_OPTIONS = filterOptions(ESIGN_STATUS_MAP).slice(1);

export function LeaseEsignSection({ item, onCommit }) {
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
    const parties = (await listLeaseParties(item.id)) ?? [];
    const signers = parties
      .filter((p) => p.metadata?.signs !== false && p.role !== "occupant")
      .map((p) => ({ id: crypto.randomUUID(), label: p.name, email: p.email || "", role: p.role, done: false }));
    const row = {
      id: crypto.randomUUID(),
      name: `${item.name || "Lease"} — signatures`,
      signer: signers[0]?.label || item.tenantName || "",
      leaseId: item.id,
      status: "Draft",
      metadata: {
        signers: signers.length ? signers : item.tenantName ? [{ id: crypto.randomUUID(), label: item.tenantName, email: "", role: "tenant", done: false }] : [],
        documentLink: item.metadata?.lastDocumentUrl || "",
        documentFile: item.metadata?.lastDocumentFile || null,
      },
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
    const patch = { status };
    if (status === "Sent" && !row.sentAt) patch.sentAt = new Date().toISOString();
    if (status === "Signed") patch.signedAt = new Date().toISOString();
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, ...patch } : x)));
    const saved = await esignLayer.update(row.id, patch);
    if (!saved) {
      setRows((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      toast.error("Couldn't update the request.");
      return;
    }
    if (status === "Signed" && !item.signedDate) {
      await onCommit({ signedDate: todayISO() });
      toast.success("Lease marked signed today.");
    }
  };

  const toggleSigner = async (row, signerId) => {
    const signers = metaList(row, "signers").map((s) =>
      s.id === signerId ? { ...s, done: !s.done, signedOn: !s.done ? todayISO() : "" } : s,
    );
    const allDone = signers.length > 0 && signers.every((s) => s.done);
    const status = allDone ? "Signed" : signers.some((s) => s.done) ? "Partially signed" : row.status;
    setRows((prev) => prev.map((x) => (x.id === row.id ? { ...x, metadata: { ...x.metadata, signers }, signers, status } : x)));
    const ok = await esignLayer.mergeMeta(row.id, { signers });
    if (!ok) {
      setRows((prev) => prev.map((x) => (x.id === row.id ? row : x)));
      toast.error("Couldn't update the signer.");
      return;
    }
    if (status !== row.status) await setStatus({ ...row, metadata: { ...row.metadata, signers } }, status);
  };

  return (
    <div className="space-y-4">
      <Callout
        tone="info"
        icon={FileSignature}
        action={
          <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={create} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Signing Request
          </Button>
        }
      >
        <span className="font-medium">E-signature provider not connected.</span> Requests are tracked here by hand —
        send the generated document yourself, then tick each signer as signatures come back.
      </Callout>

      {rows === null ? (
        <ListLoading label="Loading signing requests" className="py-10" />
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface-subtle">
          <EmptyState icon={FileSignature} title="No signing requests yet" description="Create one to track signatures for this lease." />
        </div>
      ) : (
        rows.map((r) => {
          const signers = metaList(r, "signers");
          return (
            <SectionCard
              key={r.id}
              title={r.name}
              description={[r.sentAt ? `Sent ${formatDate(r.sentAt)}` : "Not sent", r.signedAt ? `Signed ${formatDate(r.signedAt)}` : null]
                .filter(Boolean)
                .join(" · ")}
              action={
                <div className="flex items-center gap-2">
                  <StatusPill status={r.status} map={ESIGN_STATUS_MAP} />
                  <Select value={r.status} onValueChange={(v) => setStatus(r, v)}>
                    <SelectTrigger className="h-8 w-40 bg-surface-card" aria-label="Request status">
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
                </div>
              }
              bodyPadding={false}
            >
              {signers.length ? (
                <ul className="divide-y divide-border">
                  {signers.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <label className="flex min-w-0 cursor-pointer items-center gap-3">
                        <Checkbox checked={Boolean(s.done)} onCheckedChange={() => toggleSigner(r, s.id)} />
                        <span className={s.done ? "truncate text-text-secondary line-through" : "truncate text-foreground"}>{s.label}</span>
                        {s.role ? <Badge variant="neutral">{s.role}</Badge> : null}
                      </label>
                      <span className="shrink-0 text-xs text-text-tertiary">{s.done ? `Signed ${formatDate(s.signedOn)}` : s.email || "Pending"}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-5 py-4 text-sm text-text-secondary">No signers — add people in People, then create a new request.</p>
              )}
            </SectionCard>
          );
        })
      )}
      {rows?.length ? (
        <p className="text-xs text-text-tertiary">
          Lease signed date: {item.signedDate ? formatDate(item.signedDate) : "not recorded"}.{" "}
          {item.signedDate ? (
            <button type="button" className="underline" onClick={() => onCommit({ signedDate: "" })}>
              Clear
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
