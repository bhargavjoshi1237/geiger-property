import "server-only";
import { randomUUID } from "node:crypto";

import { storeProjectFile } from "@/lib/files/server";
import { FILES_BUCKET } from "@/lib/files/refs";
import { normalizeDocument } from "@/lib/supabase/documents";
import { logActivity } from "@/lib/messaging/threads";
import { anchorsFor } from "./anchors";
import { composeLeaseDocument, sha256 } from "./compose";
import { renderPdf } from "./pdf";

// generateLeasePdf (LEAS-08): compose → render → private upload (property-files/<project>/lease/<lease>/) → documents row → the
// lease's lastDocument* keys. Callers: POST /api/leases/[id]/document now; LEAS-09 (send for signature), LEAS-16/17/19/45 later.

export const LEASE_DOCUMENT_KINDS = { agreement: "lease_agreement", signed: "lease_agreement_signed", amendment: "lease_amendment" };

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const isoDay = (d = new Date()) => new Date(d).toISOString().slice(0, 10);
const fileSafe = (s) => String(s || "").replace(/[^\p{L}\p{N} ._—-]+/gu, "").replace(/\s+/g, " ").trim().slice(0, 120);

// generateLeasePdf(db, leaseId, { projectId, actor, templateId?, includeAddenda?, anchorFor?, provider?, kind?, today? })
// → { document, unknown, empty, pages, anchors, template, addendaIds, warnings }. db must be the service role (storage + documents).
export async function generateLeasePdf(db, leaseId, opts = {}) {
  const { projectId, actor = null, templateId, includeAddenda = true, provider = "manual", kind = LEASE_DOCUMENT_KINDS.agreement, today } = opts;
  if (!db?.storage) throw fail("Private storage isn't configured.", 503);
  const doc = await composeLeaseDocument(db, leaseId, { projectId, templateId, includeAddenda });
  if (!doc) throw fail("This lease wasn't found.", 404);
  const lease = doc.ctx.lease;

  const rendered = await renderPdf({
    title: doc.title,
    subject: doc.ctx.property?.name ? `${doc.ctx.property.name} · ${lease.unit || ""}`.trim() : "",
    sections: doc.sections,
    signers: doc.signers,
    footer: doc.footer,
    labels: doc.labels,
    anchorFor: opts.anchorFor || anchorsFor(provider),
  });

  let file;
  try {
    file = await storeProjectFile(db, { projectId, ownerType: "lease", ownerId: lease.id, name: "lease-agreement.pdf", body: rendered.buffer, contentType: "application/pdf" });
  } catch (e) {
    if (/bucket not found/i.test(e.message)) throw fail("Private storage isn't configured.", 503);
    throw fail(`Couldn't store the lease PDF (${e.message}).`, 502);
  }

  const day = today || isoDay();
  const metadata = {
    format: "pdf",
    contentType: "application/pdf",
    templateId: doc.template?.id || null,
    templateName: doc.template?.name || "Starter agreement",
    templateVersion: doc.template?.version ?? null,
    templateHash: doc.templateHash,
    templateBody: doc.body,
    addendaIds: doc.addendaIds,
    pages: rendered.pages,
    sha256: sha256(rendered.buffer),
    signers: doc.signers.map(({ index, role, name, email, partyId }) => ({ index, role, name, email, partyId })),
    signatureAnchors: rendered.anchors,
    anchorProvider: opts.anchorFor ? "custom" : provider,
    language: doc.labels.code,
    unknownFields: doc.unknown,
    emptyFields: doc.empty,
    replacedCharacters: rendered.replaced,
    generatedAt: new Date().toISOString(),
    generatedBy: actor ? { id: actor.id || null, name: actor.name || actor.email || "Staff" } : { id: null, name: "System" },
  };
  const { data: row, error } = await db
    .from("documents")
    .insert({
      id: randomUUID(),
      project_id: projectId,
      owner_type: "lease",
      owner_id: lease.id,
      kind,
      name: `${fileSafe(lease.name) || "Lease"} — agreement ${day}.pdf`,
      bucket: file.bucket,
      storage_path: file.path,
      size_bytes: rendered.buffer.length,
      created_by: actor?.id || null,
      metadata,
    })
    .select("*")
    .single();
  if (error) {
    await db.storage.from(FILES_BUCKET).remove([file.path]);
    throw fail(`Couldn't record the lease PDF (${error.message}).`, 500);
  }

  // Same keys the editor sets today, plus the template the document used (2b.43).
  const { error: metaError } = await db.rpc("merge_meta", {
    p_table: "leases",
    p_id: lease.id,
    p_patch: {
      lastDocumentAt: metadata.generatedAt,
      lastDocumentId: row.id,
      lastDocumentUrl: "",
      lastDocumentFile: { bucket: file.bucket, path: file.path },
      lastDocumentTemplate: { id: metadata.templateId, version: metadata.templateVersion, hash: metadata.templateHash },
    },
  });
  if (metaError) console.error("[leasing.document] lease metadata", metaError.message);

  const addenda = doc.addendaIds.length;
  await logActivity(db, {
    projectId,
    ownerType: "lease",
    ownerId: lease.id,
    verb: "action",
    summary: `Generated the lease PDF (${rendered.pages} page${rendered.pages === 1 ? "" : "s"}${addenda ? `, ${addenda} addend${addenda === 1 ? "um" : "a"}` : ""})`,
    actorId: actor?.id || null,
    actorName: actor?.name || actor?.email || "System",
    metadata: { documentId: row.id },
  });

  const warnings = [];
  if (doc.templateMissing) warnings.push("The lease's template wasn't found, so the starter agreement was used.");
  if (rendered.replaced) warnings.push(`${rendered.replaced} character${rendered.replaced === 1 ? "" : "s"} the PDF font can't show were replaced.`);
  return {
    document: normalizeDocument(row),
    unknown: doc.unknown,
    empty: doc.empty,
    pages: rendered.pages,
    anchors: rendered.anchors,
    template: doc.template,
    addendaIds: doc.addendaIds,
    warnings,
  };
}
