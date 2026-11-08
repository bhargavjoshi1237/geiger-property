import { navPermissionKey } from "@/lib/rbac";
import { billingAccess, billingError } from "@/lib/billing/http";
import { undepositedItems } from "@/lib/billing/bank_deposits";

// GET ?projectId=&bankAccountId=&propertyId= — payments waiting in 1050 Undeposited Funds (CORE-16), oldest first.

export async function GET(request) {
  const q = request.nextUrl.searchParams;
  const projectId = q.get("projectId");
  const gate = await billingAccess(request, projectId, ["property.accounting.post", navPermissionKey("Accounting")], "Your role can't see undeposited funds.");
  if (gate.response) return gate.response;
  try {
    const res = await undepositedItems(gate.admin, projectId, { bankAccountId: q.get("bankAccountId") || undefined, propertyId: q.get("propertyId") || undefined });
    return Response.json({ ok: true, ...res });
  } catch (e) {
    return billingError(e, "Couldn't list the undeposited payments.");
  }
}
