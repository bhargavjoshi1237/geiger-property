import { readJson } from "@/lib/auth/staff";
import { billingAccess, billingError } from "@/lib/billing/http";
import { reverseJournalEntry } from "@/lib/ledger/journal_server";

// POST — reverse a journal entry on a date (CORE-46): a mirror entry under jerev:<entryId>:<date>, moved to the first open day past a
// closed period; the original stays posted (unlike a void). Body { projectId, date?, memo? }.

export async function POST(request, { params }) {
  const { entryId } = await params;
  const { projectId, date, memo } = await readJson(request);
  const gate = await billingAccess(request, projectId, "property.accounting.post", "Your role can't post to the ledger.");
  if (gate.response) return gate.response;
  try {
    const res = await reverseJournalEntry(gate.admin, { projectId, actor: gate.auth.user, entryId, date, memo });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't reverse the entry.");
  }
}
