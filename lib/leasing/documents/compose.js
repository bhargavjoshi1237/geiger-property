import "server-only";
import { createHash } from "node:crypto";

import { loadAddendaServer, loadLeaseContextServer, loadTemplateServer } from "@/lib/leasing/server_context";
import { composeDocument } from "./compose_rules";

// Server composition (LEAS-08): load the lease's records, template and addenda, then compose (compose_rules.js).

export const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// composeLeaseDocument(db, leaseId, { projectId, templateId, includeAddenda }) → composeDocument's result plus
// { ctx, templateHash } (sha256 of the body used), or null when the lease isn't in the project.
export async function composeLeaseDocument(db, leaseId, { projectId, templateId, includeAddenda = true } = {}) {
  const ctx = await loadLeaseContextServer(db, leaseId, { projectId });
  if (!ctx) return null;
  const chosen = templateId === undefined ? ctx.lease.templateId : templateId;
  const [template, addenda] = await Promise.all([
    chosen ? loadTemplateServer(db, chosen, { projectId }) : null,
    includeAddenda ? loadAddendaServer(db, leaseId, { projectId }) : [],
  ]);
  const doc = composeDocument({ ctx, template, addenda, includeAddenda });
  return { ...doc, ctx, templateHash: sha256(doc.body), templateMissing: Boolean(chosen && !template) };
}
