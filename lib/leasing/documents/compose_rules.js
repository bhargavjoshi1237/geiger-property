import { DEFAULT_LEASE_BODY, buildMergeValues, mergeTemplate } from "@/lib/leasing/merge";

// Lease document composition (LEAS-08), pure and browser-safe: template + custom fields + addenda → sections, signers and gaps.
// The server loads the records (compose.js) and renders the PDF (pdf.js); the lease editor's preview reuses the same rules.

const list = (v) => (Array.isArray(v) ? v : []);
const str = (v) => (v === null || v === undefined ? "" : String(v));
const stripBraces = (s) => str(s).replace(/[{}\s]/g, "");

// A heading line that opens the signature section; everything after it is replaced by generated signature blocks.
export const SIGNATURE_HEADING = /^\s*(signatures?|signature page|firmas?)\s*:?\s*$/i;

// Statuses that keep an addendum out of the document.
const LEFT_OUT = new Set(["void", "voided"]);
export const isAddendumIncluded = (a) => Boolean(a) && !a.deletedAt && !LEFT_OUT.has(str(a.status).trim().toLowerCase());

// The body a template contributes: its own text, else the starter agreement (same rule as the preview).
export const bodyOf = (template) => (str(template?.body).trim() ? template.body : DEFAULT_LEASE_BODY);

// Template custom fields ({{parking_space}} → value) plus this lease's overrides (lease.metadata.templateFieldValues).
export function customFieldValues(template, lease) {
  const meta = template?.metadata || {};
  const out = {};
  for (const f of [...list(meta.mergeFields ?? template?.mergeFields), ...list(meta.customFields ?? template?.customFields)]) {
    const key = stripBraces(f?.key || f?.label);
    if (key) out[key] = str(f.value ?? f.sample);
  }
  const overrides = lease?.metadata?.templateFieldValues ?? lease?.templateFieldValues;
  if (overrides && typeof overrides === "object") {
    for (const [k, v] of Object.entries(overrides)) if (stripBraces(k) && str(v).trim()) out[stripBraces(k)] = str(v);
  }
  return out;
}

// The template's custom fields as { key, value } rows, for the lease editor.
export function customFieldList(template) {
  const meta = template?.metadata || {};
  return [...list(meta.mergeFields ?? template?.mergeFields), ...list(meta.customFields ?? template?.customFields)]
    .map((f) => ({ key: stripBraces(f?.key || f?.label), value: str(f?.value ?? f?.sample) }))
    .filter((f) => f.key);
}

const dayOf = (v) => str(v).slice(0, 10);
const effectiveOf = (a) => dayOf(a?.effectiveDate ?? a?.metadata?.effectiveDate);

// Included addenda in document order: effective date (undated last), then created_at.
export function orderAddenda(addenda) {
  return list(addenda)
    .filter(isAddendumIncluded)
    .slice()
    .sort((a, b) => (effectiveOf(a) || "9999-12-31").localeCompare(effectiveOf(b) || "9999-12-31") || str(a.createdAt).localeCompare(str(b.createdAt)));
}

// Labels printed by the renderer; Spanish leases get Spanish captions, anything else English.
export const LABELS = {
  en: {
    code: "en",
    page: (n, m) => `Page ${n} of ${m}`,
    signatures: "SIGNATURES",
    signature: "Signature",
    date: "Date",
    addendum: (n, name) => `Addendum ${n}: ${name}`,
    effective: (d) => `Effective ${d}`,
    attachedTo: (lease) => `Attached to the lease “${lease}”`,
    roles: { tenant: "Tenant", cosigner: "Co-signer", guarantor: "Guarantor", landlord: "Landlord" },
  },
  es: {
    code: "es",
    page: (n, m) => `Página ${n} de ${m}`,
    signatures: "FIRMAS",
    signature: "Firma",
    date: "Fecha",
    addendum: (n, name) => `Anexo ${n}: ${name}`,
    effective: (d) => `Vigente desde ${d}`,
    attachedTo: (lease) => `Anexo al contrato “${lease}”`,
    roles: { tenant: "Inquilino", cosigner: "Codeudor", guarantor: "Fiador", landlord: "Arrendador" },
  },
};
export const labelsFor = (language) => (/^(es|spanish|español)/i.test(str(language).trim()) ? LABELS.es : LABELS.en);

const ROLE_RANK = { tenant: 0, cosigner: 1, guarantor: 2 };

// Who signs, in signing order: tenants (primary first), co-signers, guarantors, then the landlord countersigner.
// Occupants and parties marked "doesn't sign" are left out (as the E-signature tab); index is 1-based (provider signer order).
export function signersOf({ parties = [], lease = {}, values = {}, company = {} } = {}) {
  const signing = list(parties)
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p && p.role !== "occupant" && (p.metadata?.signs ?? p.signs) !== false && str(p.name).trim())
    .sort((a, b) => (ROLE_RANK[a.p.role] ?? 3) - (ROLE_RANK[b.p.role] ?? 3) || Number(Boolean(b.p.isPrimary)) - Number(Boolean(a.p.isPrimary)) || a.i - b.i)
    .map(({ p }) => ({ role: ROLE_RANK[p.role] === undefined ? "tenant" : p.role, name: str(p.name).trim(), email: str(p.email), partyId: p.id || null }));
  const people = signing.length
    ? signing
    : str(lease.tenantName || values["tenant.name"]).trim()
      ? [{ role: "tenant", name: str(lease.tenantName || values["tenant.name"]).trim(), email: str(values["tenant.email"]), partyId: null }]
      : [];
  const landlord = { role: "landlord", name: str(values["landlord.name"]).trim() || company.dba || company.legalName || "Landlord", email: str(company.email), partyId: null };
  return [...people, landlord].map((s, i) => ({ ...s, index: i + 1, key: `s${i + 1}` }));
}

const LOWER = /[a-zß-ÿ]/;
const LETTER = /[A-Za-zÀ-ÿ]/;
const BULLET = /^([•·\-*])\s+/;
const NUMBERED = /^(\d{1,3}[.)])\s+/;
// "3. RENT. Tenant shall…" → bold "3. RENT." lead-in.
const LEAD_IN = /^(\d{1,3}[.)]\s+[A-ZÀ-Þ][A-ZÀ-Þ0-9 ,&'’/()\-]*[A-ZÀ-Þ)]\.)(\s+)/;

// An all-caps line (ignoring parenthesised text), short enough to be a heading.
const isHeading = (line) => {
  const t = line.trim();
  if (!t || t.length > 90 || BULLET.test(t)) return false;
  const core = t.replace(/\([^)]*\)/g, "");
  return LETTER.test(core) && !LOWER.test(core);
};

// Merged text → { blocks, signatureCut }: blocks are { type: "title" | "heading" | "para", lines: [{ runs: [{ text, bold }], marker }] }.
export function bodyBlocks(text, { titleFirst = true } = {}) {
  const lines = str(text).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const blocks = [];
  let para = null;
  let signatureCut = false;
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (SIGNATURE_HEADING.test(line)) {
      signatureCut = true;
      break;
    }
    if (!line.trim()) {
      para = null;
      continue;
    }
    if (isHeading(line)) {
      blocks.push({ type: titleFirst && blocks.length === 0 ? "title" : "heading", lines: [{ runs: [{ text: line.trim(), bold: true }], marker: "" }] });
      para = null;
      continue;
    }
    if (!para) {
      para = { type: "para", lines: [] };
      blocks.push(para);
    }
    const t = line.trim();
    const lead = t.match(LEAD_IN);
    const marker = (t.match(BULLET) || t.match(NUMBERED) || [])[1] || "";
    const runs = lead ? [{ text: lead[1], bold: true }, { text: ` ${t.slice(lead[0].length)}`, bold: false }] : [{ text: t, bold: false }];
    para.lines.push({ runs, marker: lead ? "" : marker });
  }
  return { blocks, signatureCut };
}

// Plain text of blocks (tests and previews).
export const blocksText = (blocks) => list(blocks).map((b) => b.lines.map((l) => l.runs.map((r) => r.text).join("")).join("\n")).join("\n\n");

const longDate = (v) =>
  v ? new Date(`${dayOf(v)}T00:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "";

// The document from loaded records → { title, sections, signers, unknown, empty, body, values, template, addendaIds, labels, footer }.
// ctx is loadLeaseContext's shape; template and addenda are normalized rows; Void addenda are left out.
export function composeDocument({ ctx, template = null, addenda = [], includeAddenda = true } = {}) {
  const lease = ctx?.lease || {};
  const values = { ...buildMergeValues(ctx || {}), ...customFieldValues(template, lease) };
  const body = bodyOf(template);
  const main = mergeTemplate(body, values);
  const unknown = new Set(main.unknown);
  const empty = new Set(main.empty);
  const labels = labelsFor(lease.documentLanguage || lease.metadata?.documentLanguage || template?.metadata?.language);
  const leaseName = str(lease.name) || "Lease";
  const sections = [{ kind: "body", id: "body", number: 0, title: "", subtitle: "", blocks: bodyBlocks(main.text).blocks, sign: true, newPage: false }];

  const included = includeAddenda ? orderAddenda(addenda) : [];
  included.forEach((a, i) => {
    const merged = mergeTemplate(str(a.body), values);
    merged.unknown.forEach((k) => unknown.add(k));
    merged.empty.forEach((k) => empty.add(k));
    const effective = effectiveOf(a);
    sections.push({
      kind: "addendum",
      id: a.id,
      number: i + 1,
      title: labels.addendum(i + 1, str(a.name).trim() || "Addendum"),
      subtitle: [effective ? labels.effective(longDate(effective)) : "", labels.attachedTo(leaseName)].filter(Boolean).join(" · "),
      blocks: bodyBlocks(merged.text, { titleFirst: false }).blocks,
      sign: (a.requiresSignature ?? a.metadata?.requiresSignature) !== false,
      newPage: true,
    });
  });

  return {
    title: `${leaseName} — lease agreement`,
    sections,
    signers: signersOf({ parties: ctx?.parties, lease, values, company: ctx?.company || {} }),
    unknown: [...unknown],
    empty: [...empty],
    body,
    values,
    template: template?.id ? { id: template.id, name: str(template.name), version: Number(template.metadata?.version ?? template.version) || null } : null,
    addendaIds: included.map((a) => a.id),
    labels,
    footer: leaseName,
  };
}
