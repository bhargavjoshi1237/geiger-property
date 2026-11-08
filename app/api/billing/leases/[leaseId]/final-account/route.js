import { jsonError, readJson, requireStaff } from "@/lib/auth/staff";
import { staffCan } from "@/lib/auth/permissions";
import { billingAccess, billingError, entryView } from "@/lib/billing/http";
import { finalAccount, finalAccountDocuments } from "@/lib/billing/move_out";
import { NO_WRITE_OFF, WRITE_OFF_PERMISSION } from "@/lib/billing/write_off_rules";

// Move-out final account (CORE-13). GET ?projectId&doc=letter|statement — the committed disposition letter or final statement as a page
// (&format=json → { letterHtml, statementHtml, soda }). POST { projectId, commit, version, charges, accelerate, refundMethod, moveOutDate?,
// email?, sendEmail?, earlyTermFee?, settlement?, writeOffReason?, writeOffNote? } — commit:false previews every step; commit:true closes the account once.
// settlement "write_off" (CORE-15) also needs accounting.write_off: the balance left is written off to Bad Debt after the documents.

export const maxDuration = 120;

const bodyOf = (b) => ({
  projectId: b.projectId,
  version: b.version,
  charges: Array.isArray(b.charges) ? b.charges : undefined,
  accelerate: b.accelerate && typeof b.accelerate === "object" ? b.accelerate : undefined,
  refundMethod: typeof b.refundMethod === "string" ? b.refundMethod.slice(0, 40) : "",
  moveOutDate: b.moveOutDate || undefined,
  email: typeof b.email === "string" ? b.email.slice(0, 200) : undefined,
  sendEmail: b.sendEmail !== false,
  earlyTermFee: b.earlyTermFee !== false,
  settlement: ["plan", "write_off"].includes(b.settlement) ? b.settlement : "open",
  writeOffReason: typeof b.writeOffReason === "string" ? b.writeOffReason.slice(0, 40) : "",
  writeOffNote: typeof b.writeOffNote === "string" ? b.writeOffNote.slice(0, 500) : "",
});

export async function GET(request, { params }) {
  const { leaseId } = await params;
  const q = request.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const auth = await requireStaff(request, projectId, { anyOf: ["property.accounting.post", "property.accounting.view"], denied: "Your role can't see the final account." });
  if (!auth.ok) return jsonError(auth.status, auth.error);
  if (!auth.admin) return jsonError(503, "SUPABASE_SERVICE_ROLE_KEY isn't set, so the final account can't load.");
  try {
    const docs = await finalAccountDocuments(auth.admin, leaseId, { projectId });
    if (q.get("format") === "json") return Response.json({ ok: true, ...docs });
    const html = q.get("doc") === "statement" ? docs.statementHtml : docs.letterHtml;
    return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return billingError(e, "Couldn't build the final account documents.");
  }
}

export async function POST(request, { params }) {
  const { leaseId } = await params;
  const body = await readJson(request);
  const gate = await billingAccess(request, body.projectId, "property.accounting.post", "The final account posts to the ledger, which your role can't do.");
  if (gate.response) return gate.response;
  try {
    const commit = body.commit === true;
    if (commit && body.settlement === "write_off" && !(await staffCan(gate.auth, WRITE_OFF_PERMISSION))) return jsonError(403, NO_WRITE_OFF);
    const res = await finalAccount(gate.admin, leaseId, bodyOf(body), { commit, actor: gate.auth.user });
    return Response.json({ ok: true, ...res, ...(commit ? { entries: entryView(res.entries) } : {}) });
  } catch (e) {
    return billingError(e, "Couldn't work out the final account.");
  }
}
